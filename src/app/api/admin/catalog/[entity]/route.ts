export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminRoute";

type EntityType = "provas" | "niveis" | "temas";

const COLLECTION_BY_ENTITY: Record<EntityType, string> = {
  provas: "catalog_provas",
  niveis: "catalog_niveis",
  temas: "catalog_temas",
};

function parseEntity(value: string): EntityType | null {
  if (value === "provas" || value === "niveis" || value === "temas") return value;
  return null;
}

function pickString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ entity: string }> }
) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  const { entity: rawEntity } = await context.params;
  const entity = parseEntity(rawEntity);
  if (!entity) {
    return NextResponse.json({ ok: false, error: "Entidade inválida." }, { status: 400 });
  }

  try {
    const collectionName = COLLECTION_BY_ENTITY[entity];
    const snap = await adminDb.collection(collectionName).orderBy("createdAt", "desc").get();
    const items = snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    return NextResponse.json({ ok: true, items }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível carregar os itens.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ entity: string }> }
) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  const { entity: rawEntity } = await context.params;
  const entity = parseEntity(rawEntity);
  if (!entity) {
    return NextResponse.json({ ok: false, error: "Entidade inválida." }, { status: 400 });
  }

  try {
    const payload = (await req.json()) as Record<string, unknown>;
    const code = pickString(payload.code);
    const title = pickString(payload.title);
    const status = pickString(payload.status) === "inativo" ? "inativo" : "ativo";
    const levelId = pickString(payload.levelId);
    const levelLabel = pickString(payload.levelLabel);

    if (!code || !title) {
      return NextResponse.json(
        { ok: false, error: "Código e título são obrigatórios." },
        { status: 400 }
      );
    }

    if (entity === "temas" && !levelId) {
      return NextResponse.json(
        { ok: false, error: "Tema exige um nível relacionado." },
        { status: 400 }
      );
    }

    const now = new Date();
    const collectionName = COLLECTION_BY_ENTITY[entity];
    const created = await adminDb.collection(collectionName).add({
      code,
      title,
      status,
      levelId: entity === "temas" ? levelId : null,
      levelLabel: entity === "temas" ? levelLabel || null : null,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível criar o item.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
