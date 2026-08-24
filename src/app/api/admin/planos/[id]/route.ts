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
    const normalized = value.replace(",", ".").trim();
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function sanitizeBody(body: unknown) {
  const payload = (body ?? {}) as Record<string, unknown>;
  return {
    code: pickString(payload.code),
    title: pickString(payload.title),
    productId: pickString(payload.productId),
    description: pickString(payload.description),
    imageUrl: pickString(payload.imageUrl),
    moderation: pickString(payload.moderation),
    paymentType: pickString(payload.paymentType),
    source: pickString(payload.source) === "eduzz" ? "eduzz" : "manual",
    status: pickString(payload.status) === "inativo" ? "inativo" : "ativo",
    price: pickNumber(payload.price),
  };
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  const { id } = await context.params;

  try {
    const payload = sanitizeBody(await req.json());
    await adminDb.collection("catalog_planos").doc(id).set(
      {
        code: payload.code,
        title: payload.title,
        productId: payload.productId || null,
        description: payload.description || null,
        imageUrl: payload.imageUrl || null,
        moderation: payload.moderation || null,
        paymentType: payload.paymentType || null,
        source: payload.source,
        status: payload.status,
        price: payload.price,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar plano.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  const { id } = await context.params;

  try {
    await adminDb.collection("catalog_planos").doc(id).delete();
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir plano.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
