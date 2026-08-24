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
  const profile = (payload.profile ?? {}) as Record<string, unknown>;
  const address = (profile.address ?? {}) as Record<string, unknown>;

  return {
    email: pickString(payload.email).toLowerCase(),
    password: pickString(payload.password),
    profile: {
      name: pickString(profile.name),
      document: pickString(profile.document),
      phone: pickString(profile.phone),
      cellphone: pickString(profile.cellphone),
      address: {
        street: pickString(address.street),
        number: pickString(address.number),
        neighborhood: pickString(address.neighborhood),
        complement: pickString(address.complement),
        zipCode: pickString(address.zipCode),
        city: pickString(address.city),
        state: pickString(address.state),
      },
    },
  };
}

function isAuthUserNotFound(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "auth/user-not-found";
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ uid: string }> }
) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  const { uid } = await context.params;

  try {
    const [userSnap, profileSnap, entitlementSnap] = await Promise.all([
      adminDb.collection("users").doc(uid).get(),
      adminDb.collection("users").doc(uid).collection("profile").doc("main").get(),
      adminDb.collection("entitlements").doc(uid).get(),
    ]);

    if (!userSnap.exists) {
      return NextResponse.json({ ok: false, error: "Aluno não encontrado." }, { status: 404 });
    }

    return NextResponse.json(
      {
        ok: true,
        aluno: {
          uid,
          user: userSnap.data() ?? {},
          profile: profileSnap.exists ? profileSnap.data() ?? {} : {},
          entitlement: entitlementSnap.exists ? entitlementSnap.data() ?? {} : {},
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar aluno.";
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
    const raw = await req.json();
    const payload = sanitizeBody(raw);

    const userRef = adminDb.collection("users").doc(uid);
    const profileRef = userRef.collection("profile").doc("main");
    const entitlementRef = adminDb.collection("entitlements").doc(uid);

    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return NextResponse.json({ ok: false, error: "Aluno não encontrado." }, { status: 404 });
    }

    const currentUser = userSnap.data() ?? {};
    const nextEmail = payload.email || pickString(currentUser.email);

    const authPatch: { email?: string; password?: string } = {};

    if (nextEmail && nextEmail !== pickString(currentUser.email)) {
      authPatch.email = nextEmail;
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
        updatedAt: new Date(),
      },
      { merge: true }
    );

    await profileRef.set(
      {
        name: payload.profile.name || null,
        document: payload.profile.document || null,
        phone: payload.profile.phone || null,
        cellphone: payload.profile.cellphone || null,
        address: {
          street: payload.profile.address.street || null,
          number: payload.profile.address.number || null,
          neighborhood: payload.profile.address.neighborhood || null,
          complement: payload.profile.address.complement || null,
          zipCode: payload.profile.address.zipCode || null,
          city: payload.profile.address.city || null,
          state: payload.profile.address.state || null,
        },
        source: "admin",
        updatedAt: new Date(),
      },
      { merge: true }
    );

    await entitlementRef.set(
      {
        email: nextEmail || null,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao salvar aluno.";
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

  try {
    const userRef = adminDb.collection("users").doc(uid);
    const [targetUserSnap, targetProfileSnap] = await Promise.all([
      userRef.get(),
      userRef.collection("profile").doc("main").get(),
    ]);

    if (!targetUserSnap.exists) {
      return NextResponse.json({ ok: false, error: "Aluno não encontrado." }, { status: 404 });
    }

    const targetRole = String(targetUserSnap.data()?.role ?? "").trim();
    if (targetRole !== "student") {
      return NextResponse.json(
        { ok: false, error: "Somente alunos podem ser excluídos por esta rota." },
        { status: 400 }
      );
    }

    const targetEmail =
      pickString(targetUserSnap.data()?.email) ||
      pickString(targetProfileSnap.data()?.email);

    try {
      await adminAuth.deleteUser(uid);
    } catch (error) {
      if (!isAuthUserNotFound(error)) {
        throw error;
      }
    }

    await Promise.all([
      adminDb.collection("entitlements").doc(uid).delete().catch(() => undefined),
      adminDb.recursiveDelete(userRef),
    ]);

    return NextResponse.json(
      {
        ok: true,
        uid,
        email: targetEmail || null,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir aluno.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
