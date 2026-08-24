export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminRoute";

function pickString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function pickNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const raw = value.trim();
    const normalized = raw.includes(",")
      ? raw.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")
      : raw.replace(/[^\d.-]/g, "");
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ uid: string }> }
) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  const { uid } = await context.params;

  try {
    const [userSnap, profileSnap, entitlementSnap, plansSnap] = await Promise.all([
      adminDb.collection("users").doc(uid).get(),
      adminDb.collection("users").doc(uid).collection("profile").doc("main").get(),
      adminDb.collection("entitlements").doc(uid).get(),
      adminDb.collection("catalog_planos").orderBy("title", "asc").get(),
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
        plans: plansSnap.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar assinatura.";
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
    const body = (await req.json()) as Record<string, unknown>;
    const active = body.active === true;
    const pending = body.pending === true;
    const planId = pickString(body.planId);
    const productId = pickString(body.productId);
    const productTitle = pickString(body.productTitle);
    const invoiceStatus = pickString(body.invoiceStatus);
    const amountPaid = pickNumber(body.amountPaid);
    const validUntil = pickString(body.validUntil);

    const entRef = adminDb.collection("entitlements").doc(uid);
    const entSnap = await entRef.get();

    const current = entSnap.exists ? entSnap.data() ?? {} : {};

    await entRef.set(
      {
        uid,
        email: pickString(body.email) || current.email || null,
        active,
        pending,
        source: current.source || "admin",
        planId: planId || null,
        productId: productId || null,
        productTitle: productTitle || null,
        invoiceStatus: invoiceStatus || null,
        amountPaid,
        validUntil: validUntil ? new Date(validUntil) : null,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao salvar assinatura.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
