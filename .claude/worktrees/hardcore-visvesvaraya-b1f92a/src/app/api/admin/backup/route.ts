export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/backup
 *
 * Backup completo em duas etapas paralelas:
 *
 * 1. Firestore export nativo → gs://<bucket>/firestore-backups/YYYY-MM-DD/
 *    Cobre: todas as collections (questões, alunos, assinaturas, simulados, etc.)
 *    Formato: Firestore LevelDB (importável diretamente pelo Firebase)
 *
 * 2. Firebase Auth export → gs://<bucket>/auth-backups/YYYY-MM-DD.json
 *    Cobre: UIDs, e-mails, metadata de todos os usuários
 *    Formato: JSON (legível e restaurável via firebase auth:import)
 *
 * O que NÃO é necessário fazer backup (já está no Git):
 *   - Regras do Firestore (firestore.rules)
 *   - Índices do Firestore (firestore.indexes.json)
 *   - Código da aplicação
 *
 * Autenticado por CRON_SECRET (Vercel cron) ou BACKUP_SECRET (manual).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { Storage } from "@google-cloud/storage";

const PROJECT_ID = process.env.FIREBASE_ADMIN_PROJECT_ID ?? "estudoquiz-e23ef";
// Bucket padrão do Firebase Storage. Projetos novos usam .firebasestorage.app
// (não mais .appspot.com). Permite override via env.
const GCS_BUCKET_NAME =
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? `${PROJECT_ID}.firebasestorage.app`;
const GCS_BUCKET = `gs://${GCS_BUCKET_NAME}`;
const FIRESTORE_EXPORT_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default):exportDocuments`;

// ─── Auth da rota ─────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : req.headers.get("x-backup-key")?.trim() ?? "";

  if (!token) return false;

  const allowed = [process.env.CRON_SECRET, process.env.BACKUP_SECRET]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);

  return allowed.length > 0 && allowed.includes(token);
}

// ─── Access token OAuth2 (para API REST do Firestore) ────────────────────────

async function getGoogleAccessToken(): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GoogleAuth } = require("google-auth-library") as typeof import("google-auth-library");

  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL ?? "";

  if (!privateKey || !clientEmail) {
    throw new Error("Credenciais do Firebase Admin não configuradas.");
  }

  const auth = new GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ["https://www.googleapis.com/auth/datastore", "https://www.googleapis.com/auth/cloud-platform"],
  });

  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Não foi possível obter access token do Google.");
  return token;
}

// ─── Exportação do Firestore (assíncrona no Google) ──────────────────────────

async function exportFirestore(dateLabel: string, accessToken: string) {
  const outputUriPrefix = `${GCS_BUCKET}/firestore-backups/${dateLabel}`;

  const response = await fetch(FIRESTORE_EXPORT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ outputUriPrefix }),
  });

  const data = await response.json() as Record<string, unknown>;

  if (!response.ok) {
    const errMsg = (data as { error?: { message?: string } }).error?.message ?? "Exportação do Firestore falhou.";
    throw new Error(errMsg);
  }

  return {
    operationName: data.name as string,
    outputPath: outputUriPrefix,
  };
}

// ─── Exportação dos usuários do Firebase Auth ────────────────────────────────

async function exportAuthUsers(dateLabel: string, accessToken: string) {
  // Coleta todos os usuários (paginando de 1000 em 1000)
  const users: Record<string, unknown>[] = [];
  let pageToken: string | undefined;

  do {
    const result = await adminAuth.listUsers(1000, pageToken);
    for (const user of result.users) {
      users.push({
        uid: user.uid,
        email: user.email ?? null,
        displayName: user.displayName ?? null,
        phoneNumber: user.phoneNumber ?? null,
        emailVerified: user.emailVerified,
        disabled: user.disabled,
        createdAt: user.metadata.creationTime,
        lastSignIn: user.metadata.lastSignInTime ?? null,
        providerData: user.providerData.map((p) => ({
          providerId: p.providerId,
          uid: p.uid,
          email: p.email ?? null,
        })),
      });
    }
    pageToken = result.pageToken;
  } while (pageToken);

  // Sobe para o GCS
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL ?? "";

  const storage = new Storage({
    credentials: { client_email: clientEmail, private_key: privateKey },
    projectId: PROJECT_ID,
  });

  const fileName = `auth-backups/${dateLabel}.json`;
  const file = storage.bucket(GCS_BUCKET_NAME).file(fileName);

  const content = JSON.stringify(
    { exportedAt: new Date().toISOString(), totalUsers: users.length, users },
    null,
    2
  );

  await file.save(content, {
    contentType: "application/json",
    metadata: { cacheControl: "no-cache" },
  });

  return {
    gcsPath: `${GCS_BUCKET}/${fileName}`,
    totalUsers: users.length,
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  const dateLabel = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const results: Record<string, unknown> = { date: dateLabel };

  try {
    const accessToken = await getGoogleAccessToken();

    // Executa as duas exportações em paralelo
    const [firestoreResult, authResult] = await Promise.allSettled([
      exportFirestore(dateLabel, accessToken),
      exportAuthUsers(dateLabel, accessToken),
    ]);

    if (firestoreResult.status === "fulfilled") {
      results.firestore = { ok: true, ...firestoreResult.value };
      console.log(`[backup] Firestore: exportação iniciada → ${firestoreResult.value.outputPath}`);
    } else {
      results.firestore = { ok: false, error: firestoreResult.reason instanceof Error ? firestoreResult.reason.message : "Erro desconhecido" };
      console.error("[backup] Firestore falhou:", firestoreResult.reason);
    }

    if (authResult.status === "fulfilled") {
      results.auth = { ok: true, ...authResult.value };
      console.log(`[backup] Auth: ${authResult.value.totalUsers} usuários exportados → ${authResult.value.gcsPath}`);
    } else {
      results.auth = { ok: false, error: authResult.reason instanceof Error ? authResult.reason.message : "Erro desconhecido" };
      console.error("[backup] Auth falhou:", authResult.reason);
    }

    const allOk = firestoreResult.status === "fulfilled" && authResult.status === "fulfilled";

    return NextResponse.json({ ok: allOk, results }, { status: allOk ? 200 : 207 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao iniciar backup.";
    console.error("[backup] Erro crítico:", message);
    return NextResponse.json({ ok: false, error: message, results }, { status: 500 });
  }
}

// GET — verificação de status / teste manual
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    message: "Rota de backup ativa. Use POST para iniciar.",
    covers: {
      firestore: `${GCS_BUCKET}/firestore-backups/YYYY-MM-DD/`,
      auth: `${GCS_BUCKET}/auth-backups/YYYY-MM-DD.json`,
    },
  });
}
