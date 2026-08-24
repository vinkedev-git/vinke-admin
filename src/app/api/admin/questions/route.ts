export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminRoute";

function toSafeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeText(value: unknown) {
  return toSafeString(value).toLowerCase().trim();
}

function normalizeSearchValue(value: unknown) {
  return toSafeString(value)
    .replace(/<[^>]*>/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSearchTokens(value: string) {
  return normalizeSearchValue(value).split(" ").filter(Boolean);
}

type SearchFilters = {
  generalTokens: string[];
  yearTokens: string[];
  examTokens: string[];
  themeTokens: string[];
  levelTokens: string[];
  idTokens: string[];
  promptTokens: string[];
  explanationTokens: string[];
};

function createEmptySearchFilters(): SearchFilters {
  return {
    generalTokens: [],
    yearTokens: [],
    examTokens: [],
    themeTokens: [],
    levelTokens: [],
    idTokens: [],
    promptTokens: [],
    explanationTokens: [],
  };
}

function parseAdvancedSearch(raw: string): SearchFilters {
  const filters = createEmptySearchFilters();
  const rawTokens = raw.match(/"[^"]+"|\S+/g) ?? [];

  const expandAndPush = (target: string[], value: string) => {
    const tokens = splitSearchTokens(value);
    for (const token of tokens) target.push(token);
  };

  for (const rawToken of rawTokens) {
    const token = rawToken.trim();
    if (!token) continue;

    const separatorIndex = token.indexOf(":");
    if (separatorIndex <= 0) {
      expandAndPush(filters.generalTokens, token);
      continue;
    }

    const field = normalizeSearchValue(token.slice(0, separatorIndex));
    const value = token.slice(separatorIndex + 1).replace(/^"|"$/g, "");
    if (!value.trim()) continue;

    if (field === "ano" || field === "year") {
      expandAndPush(filters.yearTokens, value);
      continue;
    }
    if (field === "prova" || field === "exam" || field === "tipo") {
      expandAndPush(filters.examTokens, value);
      continue;
    }
    if (field === "tema" || field === "topico" || field === "topico") {
      expandAndPush(filters.themeTokens, value);
      continue;
    }
    if (field === "nivel" || field === "nivel") {
      expandAndPush(filters.levelTokens, value);
      continue;
    }
    if (field === "id" || field === "codigo" || field === "cod") {
      expandAndPush(filters.idTokens, value);
      continue;
    }
    if (field === "enunciado" || field === "texto" || field === "prompt") {
      expandAndPush(filters.promptTokens, value);
      continue;
    }
    if (field === "comentario" || field === "explicacao" || field === "explanation") {
      expandAndPush(filters.explanationTokens, value);
      continue;
    }

    // Prefixo desconhecido entra como busca geral.
    expandAndPush(filters.generalTokens, token);
  }

  return filters;
}

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function getQuestionPrompt(data: Record<string, unknown>) {
  return toSafeString(data.prompt_text ?? data.prompt ?? data.questionText ?? data.statement);
}

function getQuestionThemes(data: Record<string, unknown>) {
  const raw = data.themes;
  if (Array.isArray(raw)) {
    return raw.map((item) => toSafeString(item).trim()).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw
      .split(/[;,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function getQuestionSearchText(id: string, data: Record<string, unknown>) {
  const prompt = getQuestionPrompt(data);
  const examType = toSafeString(data.examType ?? data.prova_tipo);
  const examYear = String(data.examYear ?? data.prova_ano ?? "");
  const examSource = toSafeString(data.examSource ?? data.Prova);
  const level = toSafeString(data.level ?? data.nivel);
  const themes = getQuestionThemes(data).join(" ");

  return normalizeSearchValue([id, prompt, examType, examYear, examSource, level, themes].join(" "));
}

function includesAllTokens(haystack: string, tokens: string[]) {
  if (!tokens.length) return true;
  return tokens.every((token) => haystack.includes(token));
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

function toMillis(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "object" && value !== null) {
    const asTimestamp = value as { toMillis?: () => number; seconds?: number };
    if (typeof asTimestamp.toMillis === "function") {
      const ms = asTimestamp.toMillis();
      return Number.isFinite(ms) ? ms : 0;
    }
    if (typeof asTimestamp.seconds === "number") return asTimestamp.seconds * 1000;
  }
  return 0;
}

export async function GET(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  try {
    const searchParams = req.nextUrl.searchParams;
    const searchRaw = toSafeString(searchParams.get("search"));
    const search = normalizeText(searchRaw);
    const searchFilters = parseAdvancedSearch(searchRaw);
    const status = normalizeText(searchParams.get("status"));
    const theme = toSafeString(searchParams.get("theme")).trim();
    const page = parsePositiveInt(searchParams.get("page"), 1);
    const pageSizeRaw = parsePositiveInt(searchParams.get("pageSize"), 20);
    const pageSize = [20, 30, 50, 100].includes(pageSizeRaw) ? pageSizeRaw : 20;

    const snap = await adminDb.collection("questionsBank").get();

    const allItems: Array<{ id: string; data: Record<string, unknown> }> = snap.docs
      .map((docSnap) => ({ id: docSnap.id, data: docSnap.data() as Record<string, unknown> }))
      .sort((a, b) => {
        const aTs = Math.max(toMillis(a.data["updatedAt"]), toMillis(a.data["createdAt"]));
        const bTs = Math.max(toMillis(b.data["updatedAt"]), toMillis(b.data["createdAt"]));
        return bTs - aTs;
      });

    const summary = allItems.reduce(
      (acc, item) => {
        const isActive = item.data["isActive"] !== false;
        if (isActive) acc.active += 1;
        else acc.inactive += 1;

        if (explanationHasMeaningfulText(item.data["explanation"])) {
          acc.commented += 1;
        }
        return acc;
      },
      {
        total: allItems.length,
        active: 0,
        inactive: 0,
        commented: 0,
      }
    );

    const filtered = allItems.filter((item) => {
      const isActive = item.data["isActive"] !== false;
      if (status === "ativas" && !isActive) return false;
      if (status === "inativas" && isActive) return false;

      if (theme) {
        const themes = getQuestionThemes(item.data);
        if (!themes.includes(theme)) return false;
      }

      if (!search) return true;
      const promptText = normalizeSearchValue(getQuestionPrompt(item.data));
      const explanationText = normalizeSearchValue(toSafeString(item.data.explanation));
      const examText = normalizeSearchValue(
        `${toSafeString(item.data.examType ?? item.data.prova_tipo)} ${toSafeString(item.data.examSource ?? item.data.Prova)} ${String(item.data.examYear ?? item.data.prova_ano ?? "")}`
      );
      const yearText = normalizeSearchValue(String(item.data.examYear ?? item.data.prova_ano ?? ""));
      const levelText = normalizeSearchValue(toSafeString(item.data.level ?? item.data.nivel));
      const themeText = normalizeSearchValue(getQuestionThemes(item.data).join(" "));
      const idText = normalizeSearchValue(item.id);
      const generalHaystack = getQuestionSearchText(item.id, item.data);

      if (!includesAllTokens(generalHaystack, searchFilters.generalTokens)) return false;
      if (!includesAllTokens(yearText, searchFilters.yearTokens)) return false;
      if (!includesAllTokens(examText, searchFilters.examTokens)) return false;
      if (!includesAllTokens(themeText, searchFilters.themeTokens)) return false;
      if (!includesAllTokens(levelText, searchFilters.levelTokens)) return false;
      if (!includesAllTokens(idText, searchFilters.idTokens)) return false;
      if (!includesAllTokens(promptText, searchFilters.promptTokens)) return false;
      if (!includesAllTokens(explanationText, searchFilters.explanationTokens)) return false;
      return true;
    });

    const totalFiltered = filtered.length;
    const totalPages = Math.max(Math.ceil(totalFiltered / pageSize), 1);
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const end = start + pageSize;
    const items = filtered.slice(start, end).map((item) => ({
      id: item.id,
      ...item.data,
    }));

    return NextResponse.json(
      {
        ok: true,
        items,
        pagination: {
          page: safePage,
          pageSize,
          totalFiltered,
          totalPages,
        },
        summary,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao listar questões.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const now = new Date();

    const ref = await adminDb.collection("questionsBank").add({
      ...body,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ ok: true, id: ref.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar questão.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
