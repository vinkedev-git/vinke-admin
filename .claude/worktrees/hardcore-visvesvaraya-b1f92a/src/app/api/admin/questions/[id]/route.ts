export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminRoute";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "ID da questão é obrigatório." }, { status: 400 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    await adminDb.collection("questionsBank").doc(id).set(
      {
        ...body,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao salvar questão.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "ID da questão é obrigatório." }, { status: 400 });
    }

    await adminDb.collection("questionsBank").doc(id).delete();
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir questão.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

