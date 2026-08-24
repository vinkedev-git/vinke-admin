export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminRoute";

type Report = {
  id: string;
  questionId?: string;
  questaoId?: string;
  uid?: string;
  userId?: string;
  userUid?: string;
  alunoId?: string;
};

function getQuestionId(r: Report) {
  return r.questionId || r.questaoId || "";
}

function getUid(r: Report) {
  return r.uid || r.userId || r.userUid || r.alunoId || "";
}

function chunkArray<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

export async function GET(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  try {
    const snap = await adminDb
      .collection("erros_reportados")
      .orderBy("createdAt", "desc")
      .limit(300)
      .get();

    const items = snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Record<string, unknown>) }));

    const qIds = Array.from(
      new Set((items as Report[]).map((item) => getQuestionId(item)).filter(Boolean))
    ) as string[];
    const uIds = Array.from(
      new Set((items as Report[]).map((item) => getUid(item)).filter(Boolean))
    ) as string[];

    const questionCache: Record<string, { id: string; prompt?: string; questionText?: string; statement?: string }> = {};
    const userCache: Record<string, { name?: string; email?: string }> = {};

    for (const idsChunk of chunkArray(qIds, 10)) {
      const fromQuestionsBank = await adminDb
        .collection("questionsBank")
        .where("__name__", "in", idsChunk)
        .get();

      const found = new Set<string>();
      fromQuestionsBank.docs.forEach((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        questionCache[docSnap.id] = {
          id: docSnap.id,
          prompt: String(data.prompt ?? ""),
          questionText: String(data.questionText ?? ""),
          statement: String(data.statement ?? ""),
        };
        found.add(docSnap.id);
      });

      const missingIds = idsChunk.filter((id) => !found.has(id));
      if (!missingIds.length) continue;

      const fromLegacy = await adminDb
        .collection("questoes")
        .where("__name__", "in", missingIds)
        .get();
      fromLegacy.docs.forEach((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        questionCache[docSnap.id] = {
          id: docSnap.id,
          prompt: String(data.prompt ?? ""),
          questionText: String(data.questionText ?? ""),
          statement: String(data.statement ?? data.enunciado ?? ""),
        };
      });
    }

    for (const idsChunk of chunkArray(uIds, 10)) {
      const users = await adminDb.collection("users").where("__name__", "in", idsChunk).get();
      users.docs.forEach((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        userCache[docSnap.id] = {
          name: String(data.name ?? data.nome ?? data.displayName ?? data.alunoNome ?? "").trim(),
          email: String(data.email ?? "").trim(),
        };
      });
    }

    return NextResponse.json({ ok: true, items, questionCache, userCache }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível carregar erros reportados.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
