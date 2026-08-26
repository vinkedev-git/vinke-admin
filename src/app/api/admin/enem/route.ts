export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminRoute";

// Importador de provas oficiais do ENEM a partir da base pública enem.dev.
// A importação é feita em lotes (chunks) para caber no tempo de execução
// de funções serverless — o cliente chama POST repetidas vezes com offset.

const ENEM_API = "https://api.enem.dev/v1";
const CHUNK_LIMIT = 45;

const AREA_BY_DISCIPLINE: Record<string, { areaId: string; nome: string }> = {
  linguagens: { areaId: "area-linguagens", nome: "Linguagens, Códigos e suas Tecnologias" },
  "ciencias-humanas": { areaId: "area-humanas", nome: "Ciências Humanas e suas Tecnologias" },
  "ciencias-natureza": { areaId: "area-natureza", nome: "Ciências da Natureza e suas Tecnologias" },
  matematica: { areaId: "area-matematica", nome: "Matemática e suas Tecnologias" },
};

const DISCIPLINA_FIXA: Record<string, { id: string; nome: string }> = {
  matematica: { id: "disc-matematica", nome: "Matemática" },
  ingles: { id: "disc-ingles", nome: "Inglês" },
  espanhol: { id: "disc-espanhol", nome: "Espanhol" },
};

type EnemAlternative = {
  letter: string;
  text: string | null;
  file: string | null;
  isCorrect: boolean;
};

type EnemQuestion = {
  index: number;
  discipline: string | null;
  language: string | null;
  year: number;
  context: string | null;
  files: string[];
  correctAlternative: string | null;
  alternativesIntroduction: string | null;
  alternatives: EnemAlternative[];
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Conversão mínima de markdown (o formato do enem.dev) para o HTML que o
// app renderiza: parágrafos, imagens, negrito e itálico.
function markdownToHtml(md: string) {
  const withImages = escapeHtml(md).replace(
    /!\[([^\]]*)\]\((https?:[^)\s]+)\)/g,
    '<img src="$2" alt="$1" style="max-width:100%">'
  );
  return withImages
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const inline = block
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
        .replace(/\n/g, "<br>");
      return `<p>${inline}</p>`;
    })
    .join("");
}

function buildQuestionDoc(q: EnemQuestion) {
  const language = (q.language ?? "").trim().toLowerCase();
  const discipline = (q.discipline ?? "").trim().toLowerCase();

  const area = AREA_BY_DISCIPLINE[discipline] ?? null;
  const disciplinaFixa = DISCIPLINA_FIXA[language] ?? DISCIPLINA_FIXA[discipline] ?? null;

  const contextMd = (q.context ?? "").trim();
  const intro = (q.alternativesIntroduction ?? "").trim();
  const referencedFiles = new Set(
    [...contextMd.matchAll(/\((https?:[^)\s]+)\)/g)].map((m) => m[1])
  );
  const extraFiles = (q.files ?? []).filter((f) => f && !referencedFiles.has(f));

  const promptHtml = [
    contextMd ? markdownToHtml(contextMd) : "",
    ...extraFiles.map((f) => `<p><img src="${escapeHtml(f)}" alt="" style="max-width:100%"></p>`),
    intro ? `<p>${escapeHtml(intro)}</p>` : "",
  ]
    .filter(Boolean)
    .join("");

  const options = (q.alternatives ?? [])
    .filter((a) => ["A", "B", "C", "D", "E"].includes(a.letter))
    .map((a) => ({
      id: a.letter,
      text: (a.text ?? "").trim(),
      imageUrl: a.file ?? null,
      imageWidth: 100,
    }));

  const optionByLetter = Object.fromEntries(options.map((o) => [o.id, o]));

  const now = new Date();
  return {
    prompt: promptHtml,
    prompt_text: promptHtml,
    explanation: "",
    explanationFormat: "html",
    explanationSource: null,
    examId: "enem",
    examType: "ENEM",
    prova_tipo: "ENEM",
    examYear: q.year,
    prova_ano: q.year,
    examSource: `(ENEM-${q.year})`,
    Prova: `(ENEM-${q.year})`,
    enemIndex: q.index,
    enemLanguage: language || null,
    areaId: area?.areaId ?? null,
    area: area?.nome ?? null,
    disciplinaId: disciplinaFixa?.id ?? null,
    disciplina: disciplinaFixa?.nome ?? "",
    level: disciplinaFixa?.nome ?? "",
    nivel: disciplinaFixa?.nome ?? "",
    levelId: disciplinaFixa?.id ?? null,
    assuntoIds: [],
    assuntos: [],
    themes: [],
    themeIds: [],
    dificuldade: null,
    isActive: true,
    status: "ativo",
    imageUrl: null,
    promptImageWidth: 100,
    options,
    optionA_text: optionByLetter.A?.text ?? "",
    optionA_imageUrl: optionByLetter.A?.imageUrl ?? null,
    optionB_text: optionByLetter.B?.text ?? "",
    optionB_imageUrl: optionByLetter.B?.imageUrl ?? null,
    optionC_text: optionByLetter.C?.text ?? "",
    optionC_imageUrl: optionByLetter.C?.imageUrl ?? null,
    optionD_text: optionByLetter.D?.text ?? "",
    optionD_imageUrl: optionByLetter.D?.imageUrl ?? null,
    optionE_text: optionByLetter.E?.text ?? "",
    optionE_imageUrl: optionByLetter.E?.imageUrl ?? null,
    correctOptionId: q.correctAlternative ?? "A",
    shuffleOptions: false, // prova oficial: preserva a ordem original
    reference: `ENEM ${q.year} · Questão ${q.index}`,
    internalNote: "",
    commentAttachments: [],
    importSource: "enem.dev",
    updatedAt: now,
    createdAt: now,
  };
}

function questionDocId(q: EnemQuestion) {
  const lang = (q.language ?? "").trim().toLowerCase();
  const suffix = lang ? `_${lang.toUpperCase()}` : "";
  return `ENEM${q.year}_Q${String(q.index).padStart(3, "0")}${suffix}`;
}

// GET /api/admin/enem — anos disponíveis + progresso de importação
export async function GET(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  try {
    const res = await fetch(`${ENEM_API}/exams`, { cache: "no-store" });
    if (!res.ok) throw new Error(`enem.dev respondeu ${res.status}`);
    const exams = (await res.json()) as Array<{ year: number; title: string }>;

    const metaSnap = await adminDb.collection("enem_imports").get();
    const metaByYear = new Map(
      metaSnap.docs.map((d) => [Number(d.id), d.data() as { total?: number; imported?: number }])
    );

    const years = await Promise.all(
      exams
        .sort((a, b) => b.year - a.year)
        .map(async (exam) => {
          const countSnap = await adminDb
            .collection("questionsBank")
            .where("examYear", "==", exam.year)
            .count()
            .get();
          const meta = metaByYear.get(exam.year);
          return {
            year: exam.year,
            title: exam.title,
            imported: countSnap.data().count,
            total: meta?.total ?? null,
          };
        })
    );

    return NextResponse.json({ ok: true, years }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Não foi possível consultar a base do ENEM.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// POST /api/admin/enem — importa um lote { year, offset } → { imported, nextOffset, total, hasMore }
export async function POST(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  try {
    const payload = (await req.json().catch(() => ({}))) as { year?: number; offset?: number };
    const year = Number(payload.year);
    const offset = Math.max(0, Number(payload.offset) || 0);
    if (!Number.isInteger(year) || year < 1998 || year > 2100) {
      return NextResponse.json({ ok: false, error: "Ano inválido." }, { status: 400 });
    }

    const res = await fetch(
      `${ENEM_API}/exams/${year}/questions?limit=${CHUNK_LIMIT}&offset=${offset}`,
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error(`enem.dev respondeu ${res.status} para ${year}.`);
    const data = (await res.json()) as {
      metadata: { total: number; hasMore: boolean };
      questions: EnemQuestion[];
    };

    const batch = adminDb.batch();
    let imported = 0;
    for (const q of data.questions ?? []) {
      if (!q.alternatives?.length || !q.correctAlternative) continue; // sem gabarito não entra
      const ref = adminDb.collection("questionsBank").doc(questionDocId(q));
      batch.set(ref, buildQuestionDoc(q), { merge: true });
      imported += 1;
    }
    await batch.commit();

    const nextOffset = offset + (data.questions?.length ?? 0);
    const hasMore = Boolean(data.metadata?.hasMore);

    // Ao terminar a prova, o total vira o número real de questões no banco
    // (a fonte inclui questões anuladas/sem gabarito, que não importamos).
    let finalTotal: number | null = data.metadata?.total ?? null;
    if (!hasMore) {
      const countSnap = await adminDb
        .collection("questionsBank")
        .where("examYear", "==", year)
        .count()
        .get();
      finalTotal = countSnap.data().count;
    }

    await adminDb
      .collection("enem_imports")
      .doc(String(year))
      .set(
        {
          total: finalTotal,
          lastOffset: nextOffset,
          updatedAt: new Date(),
        },
        { merge: true }
      );

    return NextResponse.json(
      { ok: true, imported, nextOffset, total: data.metadata?.total ?? null, hasMore },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao importar o lote.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
