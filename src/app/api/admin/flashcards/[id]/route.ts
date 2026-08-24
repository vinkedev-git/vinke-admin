export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminRoute";
import {
  COL_FLASHCARDS,
  COL_FLASHCARD_DECKS,
  DIFFICULTIES,
  MODULES,
  STATUSES,
} from "@/lib/flashcards/constants";
import type { FlashcardStatus, Module, Difficulty } from "@/lib/flashcards/types";

function pickString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function pickBool(value: unknown, fallback = false) {
  if (value === true || value === false) return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "1") return true;
    if (v === "false" || v === "0") return false;
  }
  return fallback;
}

function pickNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickArrayOfString(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  const { id } = await context.params;
  try {
    const snap = await adminDb.collection(COL_FLASHCARDS).doc(id).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Flashcard nao encontrado." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, item: { id: snap.id, ...snap.data() } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar flashcard.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  const { id } = await context.params;
  try {
    const raw = (await req.json()) as Record<string, unknown>;
    const now = new Date();

    const ref = adminDb.collection(COL_FLASHCARDS).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Flashcard nao encontrado." }, { status: 404 });
    }

    const update: Record<string, unknown> = { updatedAt: now };

    // Campos textuais
    for (const field of ["frontText", "backText", "shortExplanation", "reviewNotes", "themeName"]) {
      if (raw[field] !== undefined) update[field] = pickString(raw[field]);
    }

    // Enums
    if (raw.moduleId !== undefined) {
      const v = pickString(raw.moduleId).toLowerCase() as Module;
      if (v && !MODULES.includes(v)) {
        return NextResponse.json({ ok: false, error: "moduleId invalido." }, { status: 400 });
      }
      update.moduleId = v || null;
    }
    if (raw.difficulty !== undefined) {
      const v = pickString(raw.difficulty) as Difficulty;
      if (!DIFFICULTIES.includes(v)) {
        return NextResponse.json({ ok: false, error: "difficulty invalido." }, { status: 400 });
      }
      update.difficulty = v;
    }
    if (raw.status !== undefined) {
      const v = pickString(raw.status) as FlashcardStatus;
      if (!STATUSES.includes(v)) {
        return NextResponse.json({ ok: false, error: "status invalido." }, { status: 400 });
      }
      update.status = v;
      // Ao publicar, ativa e marca revisao concluida
      if (v === "published") {
        update.isActive = true;
        update.needsReview = false;
        update.reviewedAt = now;
        update.reviewedBy = authCheck.adminUid ?? null;
      }
      if (v === "archived" || v === "draft") {
        update.isActive = false;
      }
    }

    // Booleanos explicitos (permitem override manual)
    if (raw.isActive !== undefined) update.isActive = pickBool(raw.isActive);
    if (raw.needsReview !== undefined) update.needsReview = pickBool(raw.needsReview);

    // Numericos
    if (raw.examYear !== undefined) update.examYear = pickNumberOrNull(raw.examYear);

    // Arrays
    if (raw.deckIds !== undefined) {
      const arr = pickArrayOfString(raw.deckIds);
      if (arr) update.deckIds = arr;
    }
    if (raw.tags !== undefined) {
      const arr = pickArrayOfString(raw.tags);
      if (arr) update.tags = arr;
    }

    await ref.set(update, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar flashcard.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  const { id } = await context.params;
  try {
    await adminDb.collection(COL_FLASHCARDS).doc(id).delete();
    // Atualiza contagem nos decks (best-effort)
    // Para simplicidade, deixamos os decks recalcularem em outro ponto.
    // TODO: recalcular cardCount se necessario.
    void COL_FLASHCARD_DECKS;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir flashcard.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
