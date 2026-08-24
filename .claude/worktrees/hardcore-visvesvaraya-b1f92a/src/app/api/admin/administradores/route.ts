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

export async function GET(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  try {
    const snap = await adminDb.collection("users").where("role", "==", "admin").get();
    const items = snap.docs
      .map((docSnap) => ({
        uid: docSnap.id,
        name: String(docSnap.data().name ?? "").trim() || "Administrador sem nome",
        email: String(docSnap.data().email ?? "").trim() || "—",
      }))
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

    return NextResponse.json({ ok: true, items }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar administradores.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  try {
    const payload = sanitizeBody(await req.json());

    if (!payload.name) {
      return NextResponse.json({ ok: false, error: "Nome é obrigatório." }, { status: 400 });
    }

    if (!payload.email) {
      return NextResponse.json({ ok: false, error: "E-mail é obrigatório." }, { status: 400 });
    }

    if (!payload.password || payload.password.length < 6) {
      return NextResponse.json(
        { ok: false, error: "Senha é obrigatória e precisa ter pelo menos 6 caracteres." },
        { status: 400 }
      );
    }

    const existingUser = await adminAuth
      .getUserByEmail(payload.email)
      .then((user) => user)
      .catch(() => null);

    if (existingUser) {
      return NextResponse.json(
        { ok: false, error: "Já existe um usuário com esse e-mail." },
        { status: 409 }
      );
    }

    const created = await adminAuth.createUser({
      email: payload.email,
      password: payload.password,
      emailVerified: true,
      displayName: payload.name,
    });

    const now = new Date();

    await adminDb.collection("users").doc(created.uid).set(
      {
        uid: created.uid,
        email: payload.email,
        role: "admin",
        name: payload.name,
        source: "admin-panel",
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, uid: created.uid }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar administrador.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
