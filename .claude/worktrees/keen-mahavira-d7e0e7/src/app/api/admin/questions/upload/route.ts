export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "firebase-admin/storage";
import { requireAdmin } from "@/lib/adminRoute";

const MAX_UPLOAD_MB = 12;

function sanitizeFolder(value: string) {
  const normalized = String(value || "")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");

  if (!normalized) return "admin_uploads/questionsBank/misc";
  if (!/^[-_a-zA-Z0-9/]+$/.test(normalized)) return "admin_uploads/questionsBank/misc";
  return normalized;
}

function safeExt(name: string) {
  const ext = (name.split(".").pop() || "jpg").toLowerCase();
  if (!/^[a-z0-9]+$/.test(ext)) return "jpg";
  if (ext.length > 6) return "jpg";
  return ext;
}

function buildPublicDownloadUrl(bucketName: string, path: string, token: string) {
  const encoded = encodeURIComponent(path);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
}

export async function POST(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  try {
    const form = await req.formData();
    const file = form.get("file");
    const folder = sanitizeFolder(String(form.get("folder") || ""));

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Arquivo inválido." }, { status: 400 });
    }

    if (file.size <= 0) {
      return NextResponse.json({ ok: false, error: "Arquivo vazio." }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: `Arquivo muito grande. Limite de ${MAX_UPLOAD_MB} MB.` },
        { status: 400 }
      );
    }

    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || "";
    const bucketCandidates = [
      process.env.FIREBASE_STORAGE_BUCKET || "",
      `${projectId}.firebasestorage.app`,
      `${projectId}.appspot.com`,
    ].filter(Boolean);

    const ext = safeExt(file.name || "image.jpg");
    const path = `${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const token = crypto.randomUUID();
    const bytes = Buffer.from(await file.arrayBuffer());

    let uploadedBucket = "";
    let lastError: unknown = null;

    for (const bucketName of bucketCandidates) {
      try {
        const bucket = getStorage().bucket(bucketName);
        const object = bucket.file(path);

        await object.save(bytes, {
          resumable: false,
          metadata: {
            contentType: file.type || "application/octet-stream",
            cacheControl: "public,max-age=31536000",
            metadata: {
              firebaseStorageDownloadTokens: token,
            },
          },
        });

        uploadedBucket = bucketName;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!uploadedBucket) {
      throw lastError instanceof Error ? lastError : new Error("Não foi possível salvar no Storage.");
    }

    const url = buildPublicDownloadUrl(uploadedBucket, path, token);

    return NextResponse.json(
      {
        ok: true,
        path,
        url,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao enviar arquivo.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
