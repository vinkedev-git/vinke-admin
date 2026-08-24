export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminRoute";
import { secondsFromUnknown } from "@/lib/dateValue";

type SimuladoListItem = {
  uid: string;
  sessionId: string;
  createdAt: string;
  endedAt: string;
  aluno: string;
  totalQuestions: number;
  nota: number;
  status: "pendente" | "concluido";
};

function getSeconds(value: unknown) {
  return secondsFromUnknown(value);
}

function formatDate(value: unknown) {
  const seconds = getSeconds(value);
  if (!seconds) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(seconds * 1000));
}

function normalizeStatus(session: Record<string, unknown>) {
  const raw = String(session.status ?? session.state ?? "").trim().toLowerCase();
  if (
    raw === "concluido" ||
    raw === "concluído" ||
    raw === "completed" ||
    raw === "done" ||
    raw === "finished"
  ) {
    return "concluido" as const;
  }

  if (getSeconds(session.endedAt ?? session.finishedAt ?? session.completedAt)) {
    return "concluido" as const;
  }

  return "pendente" as const;
}

function normalizeQuestionCount(session: Record<string, unknown>) {
  const direct = Number(
    session.totalQuestions ??
      session.questionsCount ??
      session.total ??
      session.quantity ??
      session.amount
  );

  if (Number.isFinite(direct) && direct > 0) return direct;

  if (Array.isArray(session.questionIds)) return session.questionIds.length;
  if (Array.isArray(session.questions)) return session.questions.length;
  if (Array.isArray(session.items)) return session.items.length;

  return 0;
}

function normalizeScore(session: Record<string, unknown>, totalQuestions: number) {
  const direct = Number(session.scorePercent ?? session.gradePercent ?? session.notePercent);
  if (Number.isFinite(direct)) return direct;

  const maybePercent = Number(session.score ?? session.note ?? session.grade);
  if (Number.isFinite(maybePercent)) {
    if (maybePercent > 0 && maybePercent <= 1) return maybePercent * 100;
    if (maybePercent <= 100) return maybePercent;
  }

  const correctCount = Number(session.correctCount ?? session.hits ?? session.correctAnswers);
  if (Number.isFinite(correctCount) && totalQuestions > 0) {
    return (correctCount / totalQuestions) * 100;
  }

  return 0;
}

export async function GET(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  try {
    const [sessionsSnap, usersSnap] = await Promise.all([
      adminDb.collectionGroup("sessions").get(),
      adminDb.collection("users").where("role", "==", "student").get(),
    ]);

    const userMap = new Map<string, { email: string; name: string }>();
    await Promise.all(
      usersSnap.docs.map(async (userDoc) => {
        const [profileSnap] = await Promise.all([
          userDoc.ref.collection("profile").doc("main").get(),
        ]);
        userMap.set(userDoc.id, {
          email: String(userDoc.data().email ?? "").trim(),
          name:
            String(profileSnap.exists ? profileSnap.data()?.name ?? "" : "").trim() ||
            String(userDoc.data().name ?? "").trim(),
        });
      })
    );

    const items = sessionsSnap.docs
      .map((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        const uid = docSnap.ref.parent.parent?.id ?? "";
        const user = userMap.get(uid);
        const totalQuestions = normalizeQuestionCount(data);
        const score = normalizeScore(data, totalQuestions);
        const createdSource =
          data.createdAt ?? data.startedAt ?? data.startAt ?? data.created_at ?? null;
        const endedSource =
          data.endedAt ?? data.finishedAt ?? data.completedAt ?? data.closedAt ?? null;

        return {
          uid,
          sessionId: docSnap.id,
          createdAt: formatDate(createdSource),
          endedAt: formatDate(endedSource),
          aluno:
            String(data.studentName ?? "").trim() ||
            user?.name ||
            String(data.name ?? "").trim() ||
            "Aluno sem nome",
          totalQuestions,
          nota: Number(score.toFixed(1)),
          status: normalizeStatus(data),
          sortSeconds: getSeconds(createdSource),
          email: user?.email ?? "",
        };
      })
      .filter((item) => item.uid)
      .sort((a, b) => b.sortSeconds - a.sortSeconds)
      .map(({ sortSeconds: _sortSeconds, email: _email, ...item }) => item) satisfies SimuladoListItem[];

    return NextResponse.json({ ok: true, items }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar simulados.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
