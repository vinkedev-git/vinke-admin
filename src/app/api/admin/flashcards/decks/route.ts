export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminRoute";
import { COL_FLASHCARD_DECKS, MODULES } from "@/lib/flashcards/constants";
import type { Module } from "@/lib/flashcards/types";

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
    const moduleParam = url.searchParams.get("module") as Module | null;
    let query: FirebaseFirestore.Query = adminDb.collection(COL_FLASHCARD_DECKS);
    if (moduleParam && MODULES.includes(moduleParam)) {
      query = query.where("moduleId", "==", moduleParam);
    }
    const snap = await query.orderBy("order", "asc").get();
    const items = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        title: (data.title as string) ?? "",
        description: (data.description as string) ?? "",
        moduleId: (data.moduleId as string) ?? null,
        themeId: (data.themeId as string) ?? null,
        cardCount: (data.cardCount as number) ?? 0,
        isActive: Boolean(data.isActive),
        order: (data.order as number) ?? 0,
        status: (data.status as string) ?? "pending_review",
        updatedAt: toIsoOrNull(data.updatedAt),
      };
    });
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao listar decks.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
