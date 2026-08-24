export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminRoute";
import { hasActiveEntitlement } from "@/lib/entitlementStatus";
import { dateFromUnknown, secondsFromUnknown } from "@/lib/dateValue";

// ─── Cache em memória (5 min) para evitar leituras excessivas no Firestore ───
const CACHE_TTL_MS = 5 * 60 * 1000;
let _statsCache: { payload: object; ts: number } | null = null;

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

  if (!text.length) return false;

  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  // Placeholders não contam como comentário real.
  if (
    normalized === "em breve estara disponivel" ||
    normalized === "em breve estará disponível" ||
    normalized === "em breve comentario disponivel" ||
    normalized === "comentario em breve" ||
    normalized === "sem comentario"
  ) {
    return false;
  }

  return true;
}

export async function GET(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  // Retorna cache se ainda válido (ignora cache com ?refresh=1)
  const forceRefresh = new URL(req.url).searchParams.get("refresh") === "1";
  if (!forceRefresh && _statsCache && Date.now() - _statsCache.ts < CACHE_TTL_MS) {
    return NextResponse.json(_statsCache.payload, {
      status: 200,
      headers: { "X-Stats-Cache": "HIT" },
    });
  }

  try {
    const buckets = buildLast7DayBuckets();
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - 6);

    const questionsCollection = adminDb.collection("questionsBank");
    const errorsCollection = adminDb.collection("erros_reportados");
    const studentsCollection = adminDb.collection("users").where("role", "==", "student");
    const entitlementsCollection = adminDb.collection("entitlements");
    const activityCollection = adminDb.collection("user_activity");
    const resolvedStatuses = ["resolvido", "Resolvido", "RESOLVIDO"];
    const ignoredStatuses = ["ignorado", "Ignorado", "IGNORADO"];
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const onlineThreshold = new Date(Date.now() - 2 * 60 * 1000);

    const [
      questionsTotalAgg,
      studentsTotalAgg,
      studentsSnap,
      entitlementsActiveSnap,
      activitySnap,
      errorsTotalAgg,
      errorsResolvedAgg,
      errorsIgnoredAgg,
    ] = await Promise.all([
      questionsCollection.count().get(),
      studentsCollection.count().get(),
      studentsCollection.get(),
      entitlementsCollection.get(),
      activityCollection.get(),
      errorsCollection.count().get(),
      errorsCollection.where("status", "in", resolvedStatuses).count().get(),
      errorsCollection.where("status", "in", ignoredStatuses).count().get(),
    ]);

    const [allQuestionsSnap, recentQuestionsSnap, recentErrorsSnap] = await Promise.all([
      // select("explanation") busca só o campo necessário — reduz payload mas mantém count
      questionsCollection.select("explanation").get(),
      questionsCollection.select("createdAt", "updatedAt").where("createdAt", ">=", startDate).get(),
      errorsCollection.select("createdAt", "updatedAt").where("createdAt", ">=", startDate).get(),
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
      if (studentUids.has(docSnap.id) && hasActiveEntitlement(docSnap.data())) return count + 1;
      return count;
    }, 0);
    const studentsInactive = Math.max(studentsTotal - studentsActive, 0);
    const activity = activitySnap.docs.reduce(
      (acc, docSnap) => {
        if (!studentUids.has(docSnap.id)) return acc;
        const data = docSnap.data();
        const lastSeenAt = dateFromUnknown(data.lastSeenAt);
        if (!lastSeenAt) return acc;

        const client = String(data.client ?? "web").toLowerCase() === "app" ? "app" : "web";
        if (lastSeenAt >= onlineThreshold) {
          acc.online += 1;
          if (client === "app") acc.onlineApp += 1;
          else acc.onlineWeb += 1;
        }
        if (lastSeenAt >= todayStart) {
          acc.today += 1;
          if (client === "app") acc.todayApp += 1;
          else acc.todayWeb += 1;
        }
        return acc;
      },
      {
        online: 0,
        onlineWeb: 0,
        onlineApp: 0,
        today: 0,
        todayWeb: 0,
        todayApp: 0,
      }
    );

    const payload = {
        ok: true,
        stats: {
          questoesTotal: questionsTotalAgg.data().count,
          questoesComComentario: questionsWithCommentCount,
          errosPendentes: pendingErrors,
          alunosTotal: studentsTotal,
          alunosAtivos: studentsActive,
          alunosInativos: studentsInactive,
          usuariosOnline: activity.online,
          usuariosOnlineWeb: activity.onlineWeb,
          usuariosOnlineApp: activity.onlineApp,
          usuariosHoje: activity.today,
          usuariosWebHoje: activity.todayWeb,
          usuariosAppHoje: activity.todayApp,
        },
        series: {
          buckets,
          questoes: buckets.map((bucket) => Number(questionMap.get(bucket) ?? 0)),
          erros: buckets.map((bucket) => Number(errorMap.get(bucket) ?? 0)),
        },
    };

    _statsCache = { payload, ts: Date.now() };
    return NextResponse.json(payload, {
      status: 200,
      headers: { "X-Stats-Cache": "MISS" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível carregar os indicadores.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
