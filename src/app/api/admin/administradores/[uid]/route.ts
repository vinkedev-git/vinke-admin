export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminRoute";

function pickString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeBody(body: unknown) {
  const payload = (body ?? {}) as Record<string, unknown>;

  return {
    email: pickString(payload.email).toLowerCase(),
    password: pickString(payload.password),
    name: pickString(payload.name),
  };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ uid: string }> }
) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  const { uid } = await context.params;

  try {
    const userSnap = await adminDb.collection("users").doc(uid).get();

    if (!userSnap.exists || userSnap.data()?.role !== "admin") {
      return NextResponse.json(
        { ok: false, error: "Administrador não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        admin: {
          uid,
          ...userSnap.data(),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar administrador.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ uid: string }> }
) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  const { uid } = await context.params;

  try {
    const payload = sanitizeBody(await req.json());
    const userRef = adminDb.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists || userSnap.data()?.role !== "admin") {
      return NextResponse.json(
        { ok: false, error: "Administrador não encontrado." },
        { status: 404 }
      );
    }

    const current = userSnap.data() ?? {};
    const nextEmail = payload.email || pickString(current.email);
    const nextName = payload.name || pickString(current.name);

    const authPatch: { email?: string; password?: string; displayName?: string } = {};

    if (nextEmail && nextEmail !== pickString(current.email)) {
      authPatch.email = nextEmail;
    }

    if (nextName && nextName !== pickString(current.name)) {
      authPatch.displayName = nextName;
    }

    if (payload.password) {
      authPatch.password = payload.password;
    }

    if (Object.keys(authPatch).length) {
      await adminAuth.updateUser(uid, authPatch);
    }

    await userRef.set(
      {
        email: nextEmail || null,
        name: nextName || null,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao salvar administrador.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ uid: string }> }
) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  const { uid } = await context.params;

  if (authCheck.adminUid === uid) {
    return NextResponse.json(
      { ok: false, error: "Você não pode excluir o administrador logado." },
      { status: 400 }
    );
  }

  try {
    const adminsSnap = await adminDb.collection("users").where("role", "==", "admin").get();
    if (adminsSnap.size <= 1) {
      return NextResponse.json(
        { ok: false, error: "O sistema precisa manter pelo menos um administrador." },
        { status: 400 }
      );
    }

    await adminAuth.deleteUser(uid);
    await adminDb.collection("users").doc(uid).delete();

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir administrador.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
