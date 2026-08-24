/**
 * Tipos compartilhados entre admin e portal do aluno para o modulo de flashcards.
 *
 * Documentos ficam em 3 colecoes principais no Firestore:
 * - flashcards
 * - flashcardDecks
 * - userFlashcardProgress (subcolecao ou colecao raiz — decidido: colecao raiz com id = {uid}_{flashcardId})
 * - userFlashcardSettings (colecao raiz, id = uid)
 */

export type Module = "me" | "tea" | "tsa";
export type ExamType = "ME" | "TEA" | "TSA";
export type Difficulty = "easy" | "medium" | "hard";
export type FlashcardStatus = "pending_review" | "published" | "draft" | "archived";
export type SourceType = "question" | "manual" | "ai_generated";

/**
 * Documento canonico de um flashcard.
 */
export type FlashcardDoc = {
  frontText: string;
  backText: string;
  shortExplanation: string;
  themeId: string;
  themeName: string;
  moduleId: Module;
  examType: ExamType;
  examYear: number | null;
  level: string | null;
  deckIds: string[];
  tags: string[];
  difficulty: Difficulty;
  status: FlashcardStatus;
  isActive: boolean;
  sourceType: SourceType;
  sourceQuestionId: string | null;
  sourceCorrectOptionId: string | null;
  sourceCorrectOptionText: string | null;
  sourceReference: string | null;
  sourceQuestionPreview: string | null;
  needsReview: boolean;
  reviewNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
};

export type FlashcardDeckDoc = {
  title: string;
  description: string;
  moduleId: Module | null;
  themeId: string | null;
  cardCount: number;
  isActive: boolean;
  order: number;
  status: FlashcardStatus;
  createdAt: Date;
  updatedAt: Date;
};

// ─── Repeticao espacada (SM-2 simplificado) ─────────────────────────────────

export type SrsStatus = "new" | "learning" | "reviewing" | "mastered" | "archived";
export type SrsAnswer = "again" | "hard" | "good"; // "Nao sabia" | "Quase" | "Sabia"

/**
 * Progresso individual do aluno por card. Criado sob demanda na primeira revisao.
 */
export type UserFlashcardProgressDoc = {
  userId: string;
  flashcardId: string;
  deckId: string | null;
  /** Facilidade do card (SM-2). Default 2.5, minimo 1.3, maximo ~3.0 */
  easeFactor: number;
  /** Intervalo atual em dias */
  interval: number;
  /** Contagem de acertos consecutivos */
  repetitions: number;
  /** Caixa do Leitner-like para categorizar (1 a 5) — util para stats */
  box: number;
  status: SrsStatus;
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
  timesReviewed: number;
  timesCorrect: number;
  timesAlmost: number;
  timesWrong: number;
  createdAt: Date;
  updatedAt: Date;
};

export type UserFlashcardSettingsDoc = {
  userId: string;
  newCardsPerDay: number;
  reviewsPerDay: number;
  streak: number;
  longestStreak: number;
  lastStudyDate: Date | null;
  totalCardsMastered: number;
  totalReviews: number;
  enabledModules: Module[];
  createdAt: Date;
  updatedAt: Date;
};
