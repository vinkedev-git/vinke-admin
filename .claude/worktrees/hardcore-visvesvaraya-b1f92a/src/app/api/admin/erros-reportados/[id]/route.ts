export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminRoute";

type ReportStatus = "aberto" | "resolvido" | "ignorado";

function parseStatus(value: unknown): ReportStatus | null {
  if (value === "aberto" || value === "resolvido" || value === "ignorado") {
    return value;
  }
  return null;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  const { id } = await context.params;

  try {
    const payload = (await req.json()) as Record<string, unknown>;
    const status = parseStatus(payload.status);
    if (!status) {
      return NextResponse.json({ ok: false, error: "Status inválido." }, { status: 400 });
    }

    await adminDb.collection("erros_reportados").doc(id).set(
      {
        status,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível atualizar o status.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
