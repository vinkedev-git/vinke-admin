export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminRoute";
import type { FlashcardStatus, Module, Difficulty } from "@/lib/flashcards/types";
import {
  COL_FLASHCARDS,
  DIFFICULTIES,
  MODULES,
  STATUSES,
} from "@/lib/flashcards/constants";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function toIsoOrNull(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const t = value as { toDate?: () => Date };
    if (typeof t.toDate === "function") return t.toDate().toISOString();
  }
  return null;
}

export async function GET(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  try {
    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status") as FlashcardStatus | null;
    const moduleParam = url.searchParams.get("module") as Module | null;
    const difficultyParam = url.searchParams.get("difficulty") as Difficulty | null;
    const deckId = url.searchParams.get("deckId");
    const themeId = url.searchParams.get("themeId");
    const needsReviewParam = url.searchParams.get("needsReview");
    const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();
    const limitParam = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
    const limit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE;

    let query: FirebaseFirestore.Query = adminDb.collection(COL_FLASHCARDS);

    if (statusParam && STATUSES.includes(statusParam)) {
      query = query.where("status", "==", statusParam);
    }
    if (moduleParam && MODULES.includes(moduleParam)) {
      query = query.where("moduleId", "==", moduleParam);
    }
    if (difficultyParam && DIFFICULTIES.includes(difficultyParam)) {
      query = query.where("difficulty", "==", difficultyParam);
    }
    if (deckId) {
      query = query.where("deckIds", "array-contains", deckId);
    }
    if (themeId) {
      query = query.where("themeId", "==", themeId);
    }
    if (needsReviewParam === "true") {
      query = query.where("needsReview", "==", true);
    } else if (needsReviewParam === "false") {
      query = query.where("needsReview", "==", false);
    }

    // Ordena por updatedAt desc para mostrar os mais recentes primeiro
    query = query.orderBy("updatedAt", "desc").limit(limit);

    const snap = await query.get();
    let items = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        frontText: (data.frontText as string) ?? "",
        backText: (data.backText as string) ?? "",
        shortExplanation: (data.shortExplanation as string) ?? "",
        themeId: (data.themeId as string) ?? "",
        themeName: (data.themeName as string) ?? "",
        moduleId: (data.moduleId as string) ?? "",
        examType: (data.examType as string) ?? "",
        examYear: data.examYear ?? null,
        difficulty: (data.difficulty as string) ?? "medium",
        status: (data.status as string) ?? "pending_review",
        isActive: Boolean(data.isActive),
        needsReview: Boolean(data.needsReview),
        deckIds: Array.isArray(data.deckIds) ? (data.deckIds as string[]) : [],
        sourceQuestionId: (data.sourceQuestionId as string) ?? null,
        updatedAt: toIsoOrNull(data.updatedAt),
      };
    });

    // Filtro por busca textual em memoria (frontText, backText, themeName)
    if (search) {
      items = items.filter((item) =>
        [item.frontText, item.backText, item.themeName].some((field) =>
          field.toLowerCase().includes(search)
        )
      );
    }

    return NextResponse.json({ ok: true, items, total: items.length }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao listar flashcards.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
