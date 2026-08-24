import { SM2 } from "./constants";
import type { SrsAnswer, SrsStatus, UserFlashcardProgressDoc } from "./types";

/**
 * Algoritmo SM-2 simplificado para agendamento de flashcards.
 *
 * Referencia: https://super-memory.com/english/ol/sm2.htm
 *
 * Ajustes deste projeto:
 * - 3 opcoes de resposta (nao 4-6 como no SM-2 original)
 *   - "again" (Nao sabia)  → reseta card
 *   - "hard"  (Quase)      → mantem intervalo curto, ease penalizado leve
 *   - "good"  (Sabia)      → avanca conforme SM-2
 * - Ease minimo 1.3, maximo 3.0 (evita cards ficarem impossiveis ou triviais)
 * - Marca como "mastered" quando repeticoes >= 5 e intervalo >= 60 dias
 */

export type SrsState = {
  easeFactor: number;
  interval: number;
  repetitions: number;
  box: number;
  status: SrsStatus;
};

export type SrsScheduleResult = {
  easeFactor: number;
  interval: number;
  repetitions: number;
  box: number;
  status: SrsStatus;
  nextReviewAt: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * DAY_MS);
}

function clampEase(ease: number): number {
  if (ease < SM2.MIN_EASE) return SM2.MIN_EASE;
  if (ease > SM2.MAX_EASE) return SM2.MAX_EASE;
  return ease;
}

/**
 * Estado inicial para um card ainda nao estudado.
 */
export function initialSrsState(): SrsState {
  return {
    easeFactor: SM2.DEFAULT_EASE,
    interval: 0,
    repetitions: 0,
    box: 0,
    status: "new",
  };
}

/**
 * Aplica a resposta do aluno e retorna o novo estado + proxima data de revisao.
 * Nao muta o estado original.
 */
export function scheduleNext(
  current: SrsState,
  answer: SrsAnswer,
  now: Date = new Date()
): SrsScheduleResult {
  let { easeFactor, interval, repetitions, box } = current;
  let status: SrsStatus = current.status;

  if (answer === "again") {
    // Reseta: card volta como "aprendendo" e sera revisado amanha
    easeFactor = clampEase(easeFactor - SM2.EASE_PENALTY_AGAIN);
    interval = 1;
    repetitions = 0;
    box = Math.max(1, Math.floor(box / 2));
    status = "learning";
  } else if (answer === "hard") {
    // Intervalo conservador — mantem, mas com pequena penalizacao no ease
    easeFactor = clampEase(easeFactor - SM2.EASE_PENALTY_HARD);
    if (repetitions === 0) {
      interval = 1;
    } else {
      interval = Math.max(1, Math.round(interval * 1.2));
    }
    repetitions += 1;
    box = Math.max(box, 2);
    status = "reviewing";
  } else {
    // "good" — resposta correta padrao
    easeFactor = clampEase(easeFactor + SM2.EASE_BONUS_GOOD);
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.max(1, Math.round(interval * easeFactor));
    }
    repetitions += 1;
    box = Math.min(5, box + 1);
    status = "reviewing";
  }

  // Marca como dominado se satisfizer os criterios
  if (
    repetitions >= SM2.MASTERED_REPETITIONS &&
    interval >= SM2.MASTERED_INTERVAL_DAYS &&
    answer === "good"
  ) {
    status = "mastered";
  }

  const nextReviewAt = addDays(now, interval);

  return {
    easeFactor,
    interval,
    repetitions,
    box,
    status,
    nextReviewAt,
  };
}

/**
 * Determina se um card esta "vencido" (due) para revisao hoje.
 */
export function isDue(progress: Pick<UserFlashcardProgressDoc, "nextReviewAt">, now: Date = new Date()): boolean {
  if (!progress.nextReviewAt) return true;
  return progress.nextReviewAt.getTime() <= now.getTime();
}

/**
 * Ordena cards por prioridade de revisao:
 * 1) Vencidos ha mais tempo primeiro
 * 2) Cards em aprendizado
 * 3) Cards novos
 */
export function comparePriority(
  a: Pick<UserFlashcardProgressDoc, "nextReviewAt" | "status">,
  b: Pick<UserFlashcardProgressDoc, "nextReviewAt" | "status">
): number {
  const statusOrder: Record<SrsStatus, number> = {
    learning: 0,
    reviewing: 1,
    new: 2,
    mastered: 3,
    archived: 4,
  };
  const aOrder = statusOrder[a.status] ?? 5;
  const bOrder = statusOrder[b.status] ?? 5;
  if (aOrder !== bOrder) return aOrder - bOrder;
  const aTime = a.nextReviewAt?.getTime() ?? Infinity;
  const bTime = b.nextReviewAt?.getTime() ?? Infinity;
  return aTime - bTime;
}
