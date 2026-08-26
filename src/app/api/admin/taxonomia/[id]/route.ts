export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminRoute";

function pickString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

// PATCH /api/admin/taxonomia/[id] — renomear / reordenar / ativar-desativar
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  try {
    const { id } = await context.params;
    const ref = adminDb.collection("taxonomia").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Item não encontrado." }, { status: 404 });
    }

    const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    const nome = pickString(payload.nome);
    if (nome) updates.nome = nome;
    if (typeof payload.ordem === "number") updates.ordem = payload.ordem;
    if (typeof payload.ativo === "boolean") updates.ativo = payload.ativo;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: "Nada para atualizar." }, { status: 400 });
    }

    updates.updatedAt = new Date();
    await ref.set(updates, { merge: true });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível atualizar.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// DELETE /api/admin/taxonomia/[id] — só disciplina/assunto, e só sem filhos
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  try {
    const { id } = await context.params;
    const ref = adminDb.collection("taxonomia").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Item não encontrado." }, { status: 404 });
    }

    const tipo = snap.data()?.tipo;
    if (tipo === "area") {
      return NextResponse.json(
        { ok: false, error: "Áreas do ENEM são fixas e não podem ser excluídas." },
        { status: 400 }
      );
    }

    if (tipo === "disciplina") {
      const children = await adminDb
        .collection("taxonomia")
        .where("disciplinaId", "==", id)
        .limit(1)
        .get();
      if (!children.empty) {
        return NextResponse.json(
          { ok: false, error: "Exclua ou mova os assuntos desta disciplina antes." },
          { status: 400 }
        );
      }
    }

    // Futuro: bloquear exclusão se houver questões vinculadas ao nó.
    await ref.delete();
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível excluir.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
