export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminRoute";
import { secondsFromUnknown } from "@/lib/dateValue";

function buildLast7DayBuckets() {
  const today = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate()
    ).padStart(2, "0")}`;
  });
}

function getDayBucket(value: unknown) {
  const seconds = secondsFromUnknown(value);
  if (!seconds) return "";
  const date = new Date(seconds * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function explanationHasMeaningfulText(value: unknown) {
  if (typeof value !== "string") return false;
  const text = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();

  return text.length > 0;
}

export async function GET(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  try {
    const buckets = buildLast7DayBuckets();
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - 6);

    const questionsCollection = adminDb.collection("questionsBank");
    const errorsCollection = adminDb.collection("erros_reportados");
    const studentsCollection = adminDb.collection("users").where("role", "==", "student");
    const entitlementsCollection = adminDb.collection("entitlements");
    const resolvedStatuses = ["resolvido", "Resolvido", "RESOLVIDO"];
    const ignoredStatuses = ["ignorado", "Ignorado", "IGNORADO"];

    const [
      questionsTotalAgg,
      studentsTotalAgg,
      studentsSnap,
      entitlementsActiveSnap,
      errorsTotalAgg,
      errorsResolvedAgg,
      errorsIgnoredAgg,
    ] = await Promise.all([
      questionsCollection.count().get(),
      studentsCollection.count().get(),
      studentsCollection.get(),
      entitlementsCollection.where("active", "==", true).get(),
      errorsCollection.count().get(),
      errorsCollection.where("status", "in", resolvedStatuses).count().get(),
      errorsCollection.where("status", "in", ignoredStatuses).count().get(),
    ]);

    const [allQuestionsSnap, recentQuestionsSnap, recentErrorsSnap] = await Promise.all([
      questionsCollection.get(),
      questionsCollection.where("createdAt", ">=", startDate).get(),
      errorsCollection.where("createdAt", ">=", startDate).get(),
    ]);

    let questionsWithCommentCount = 0;
    allQuestionsSnap.docs.forEach((docSnap) => {
      if (explanationHasMeaningfulText(docSnap.data()?.explanation)) {
        questionsWithCommentCount += 1;
      }
    });

    const questionMap = new Map<string, number>();
    buckets.forEach((bucket) => questionMap.set(bucket, 0));
    recentQuestionsSnap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const bucket = getDayBucket(data.createdAt ?? data.updatedAt);
      if (!bucket || !questionMap.has(bucket)) return;
      questionMap.set(bucket, Number(questionMap.get(bucket) ?? 0) + 1);
    });

    const errorMap = new Map<string, number>();
    buckets.forEach((bucket) => errorMap.set(bucket, 0));
    recentErrorsSnap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const bucket = getDayBucket(data.createdAt ?? data.updatedAt);
      if (!bucket || !errorMap.has(bucket)) return;
      errorMap.set(bucket, Number(errorMap.get(bucket) ?? 0) + 1);
    });

    const pendingErrors =
      errorsTotalAgg.data().count - errorsResolvedAgg.data().count - errorsIgnoredAgg.data().count;
    const studentsTotal = studentsTotalAgg.data().count;
    const studentUids = new Set(studentsSnap.docs.map((docSnap) => docSnap.id));
    const studentsActive = entitlementsActiveSnap.docs.reduce((count, docSnap) => {
      if (studentUids.has(docSnap.id)) return count + 1;
      return count;
    }, 0);
    const studentsInactive = Math.max(studentsTotal - studentsActive, 0);

    return NextResponse.json(
      {
        ok: true,
        stats: {
          questoesTotal: questionsTotalAgg.data().count,
          questoesComComentario: questionsWithCommentCount,
          errosPendentes: pendingErrors,
          alunosTotal: studentsTotal,
          alunosAtivos: studentsActive,
          alunosInativos: studentsInactive,
        },
        series: {
          buckets,
          questoes: buckets.map((bucket) => Number(questionMap.get(bucket) ?? 0)),
          erros: buckets.map((bucket) => Number(errorMap.get(bucket) ?? 0)),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível carregar os indicadores.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
