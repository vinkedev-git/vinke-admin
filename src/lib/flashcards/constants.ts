import type { Module, ExamType, Difficulty, FlashcardStatus } from "./types";

export const MODULES: Module[] = ["me", "tea", "tsa"];
export const EXAM_TYPES: ExamType[] = ["ME", "TEA", "TSA"];
export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
export const STATUSES: FlashcardStatus[] = ["pending_review", "published", "draft", "archived"];

export const MODULE_LABEL: Record<Module, string> = {
  me: "ME",
  tea: "TEA",
  tsa: "TSA",
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "Facil",
  medium: "Medio",
  hard: "Dificil",
};

export const STATUS_LABEL: Record<FlashcardStatus, string> = {
  pending_review: "Aguardando revisao",
  published: "Publicado",
  draft: "Rascunho",
  archived: "Arquivado",
};

// Colecoes no Firestore
export const COL_FLASHCARDS = "flashcards";
export const COL_FLASHCARD_DECKS = "flashcardDecks";
export const COL_USER_FLASHCARD_PROGRESS = "userFlashcardProgress";
export const COL_USER_FLASHCARD_SETTINGS = "userFlashcardSettings";

// SM-2 parametros
export const SM2 = {
  DEFAULT_EASE: 2.5,
  MIN_EASE: 1.3,
  MAX_EASE: 3.0,
  EASE_BONUS_GOOD: 0.1,
  EASE_PENALTY_AGAIN: 0.2,
  EASE_PENALTY_HARD: 0.15,
  DEFAULT_NEW_CARDS_PER_DAY: 20,
  DEFAULT_REVIEWS_PER_DAY: 100,
  MASTERED_INTERVAL_DAYS: 60,
  MASTERED_REPETITIONS: 5,
} as const;

/**
 * Detecta se o titulo/codigo do plano corresponde ao plano com acesso a flashcards.
 * Flashcards sao exclusivos do plano TSA (Cobertura Completa).
 */
export function planHasFlashcardsAccess(plan: {
  code?: string | null;
  title?: string | null;
  productId?: string | null;
} | null | undefined): boolean {
  if (!plan) return false;
  const haystack = [plan.code, plan.title]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes("tsa") || haystack.includes("cobertura completa");
}
