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

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ entity: string; id: string }> }
) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  const { entity: rawEntity, id } = await context.params;
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

    const collectionName = COLLECTION_BY_ENTITY[entity];
    await adminDb.collection(collectionName).doc(id).set(
      {
        code,
        title,
        status,
        levelId: entity === "temas" ? levelId : null,
        levelLabel: entity === "temas" ? levelLabel || null : null,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível atualizar o item.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ entity: string; id: string }> }
) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  const { entity: rawEntity, id } = await context.params;
  const entity = parseEntity(rawEntity);
  if (!entity) {
    return NextResponse.json({ ok: false, error: "Entidade inválida." }, { status: 400 });
  }

  try {
    const collectionName = COLLECTION_BY_ENTITY[entity];
    await adminDb.collection(collectionName).doc(id).delete();
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível excluir o item.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
