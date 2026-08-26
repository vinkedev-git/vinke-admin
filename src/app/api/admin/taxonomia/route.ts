export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminRoute";

export type TaxonomiaTipo = "area" | "disciplina" | "assunto";

function pickString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// GET /api/admin/taxonomia — árvore completa (lista plana ordenada)
export async function GET(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  try {
    const snap = await adminDb.collection("taxonomia").get();
    const items = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    return NextResponse.json({ ok: true, items }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Não foi possível carregar a taxonomia.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// POST /api/admin/taxonomia — cria disciplina ou assunto
export async function POST(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  try {
    const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const tipo = pickString(payload.tipo) as TaxonomiaTipo;
    const nome = pickString(payload.nome);
    const areaId = pickString(payload.areaId);
    const disciplinaId = pickString(payload.disciplinaId);

    if (!nome) {
      return NextResponse.json({ ok: false, error: "Nome é obrigatório." }, { status: 400 });
    }
    if (tipo !== "disciplina" && tipo !== "assunto") {
      return NextResponse.json(
        { ok: false, error: "Tipo inválido — apenas disciplina ou assunto podem ser criados." },
        { status: 400 }
      );
    }
    if (!areaId) {
      return NextResponse.json({ ok: false, error: "areaId é obrigatório." }, { status: 400 });
    }
    if (tipo === "assunto" && !disciplinaId) {
      return NextResponse.json(
        { ok: false, error: "disciplinaId é obrigatório para assunto." },
        { status: 400 }
      );
    }

    const areaSnap = await adminDb.collection("taxonomia").doc(areaId).get();
    if (!areaSnap.exists || areaSnap.data()?.tipo !== "area") {
      return NextResponse.json({ ok: false, error: "Área não encontrada." }, { status: 404 });
    }

    if (tipo === "assunto") {
      const discSnap = await adminDb.collection("taxonomia").doc(disciplinaId).get();
      if (!discSnap.exists || discSnap.data()?.tipo !== "disciplina") {
        return NextResponse.json(
          { ok: false, error: "Disciplina não encontrada." },
          { status: 404 }
        );
      }
    }

    const prefix = tipo === "disciplina" ? "disc" : "ass";
    const parentSlug =
      tipo === "assunto" ? disciplinaId.replace(/^disc-/, "") + "-" : "";
    const id = `${prefix}-${parentSlug}${slugify(nome)}`;

    const ref = adminDb.collection("taxonomia").doc(id);
    const existing = await ref.get();
    if (existing.exists) {
      return NextResponse.json(
        { ok: false, error: "Já existe um item com esse nome." },
        { status: 409 }
      );
    }

    const now = new Date();
    const data = {
      tipo,
      nome,
      areaId,
      ...(tipo === "assunto" ? { disciplinaId } : {}),
      ordem: 999,
      ativo: true,
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(data);

    return NextResponse.json({ ok: true, item: { id, ...data } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível criar o item.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
