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

export async function GET(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  try {
    const snap = await adminDb.collection("catalog_planos").orderBy("createdAt", "desc").get();
    const items = snap.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));
    return NextResponse.json({ ok: true, items }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao listar planos.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  try {
    const payload = sanitizeBody(await req.json());
    if (!payload.code || !payload.title) {
      return NextResponse.json(
        { ok: false, error: "Código e título são obrigatórios." },
        { status: 400 }
      );
    }

    const now = new Date();
    const ref = await adminDb.collection("catalog_planos").add({
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
      createdAt: now,
      updatedAt: now,
      lastSyncedAt: payload.source === "eduzz" ? now : null,
    });

    return NextResponse.json({ ok: true, id: ref.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar plano.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
