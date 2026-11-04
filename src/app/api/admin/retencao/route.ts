// src/app/api/admin/retencao/route.ts
// Retenção por coorte semanal de cadastro (Vinke aberto). Para cada semana:
// cadastros, quantos responderam ≥1 questão, quantos voltaram a responder 1+ e
// 7+ dias depois do cadastro (proxy de D1/D7 a partir de lastAnswerAt).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminRoute";
import { vinkeAbertoAtivo, VINKE_ABERTO_INICIO } from "@/lib/emailsGratuito";

const D = 86_400_000;
const BRT = 3 * 3_600_000;

/** Segunda-feira (Brasília) da semana da data, em ms UTC-3 "nominal". */
function semanaDe(ms: number) {
  const d = new Date(ms - BRT);
  const dow = (d.getUTCDay() + 6) % 7; // seg=0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow);
}

export async function GET(req: NextRequest) {
  const check = await requireAdmin(req);
  if ("error" in check) return check.error;
  const now = Date.now();

  const users: { uid: string; createdMs: number }[] = [];
  let pageToken: string | undefined;
  do {
    const page = await adminAuth.listUsers(1000, pageToken);
    for (const u of page.users) if (u.email) users.push({ uid: u.uid, createdMs: new Date(u.metadata.creationTime).getTime() });
    pageToken = page.pageToken;
  } while (pageToken);

  type Row = { uid: string; createdMs: number; total: number; lastMs: number; plan: string };
  const rows: Row[] = [];
  const LOTE = 25;
  for (let i = 0; i < users.length; i += LOTE) {
    const parte = users.slice(i, i + LOTE);
    const r = await Promise.all(
      parte.map(async (u) => {
        const [st, ent] = await Promise.all([adminDb.doc(`users/${u.uid}/meta/stats`).get(), adminDb.doc(`entitlements/${u.uid}`).get()]);
        const s = (st.data() ?? {}) as { totalAnswered?: unknown; lastAnswerAt?: { toMillis?: () => number } };
        return { uid: u.uid, createdMs: u.createdMs, total: Number(s.totalAnswered ?? 0), lastMs: s.lastAnswerAt?.toMillis?.() ?? 0, plan: String(ent.data()?.plan ?? "") };
      }),
    );
    rows.push(...r);
  }

  const porSemana = new Map<number, Row[]>();
  for (const r of rows) {
    const k = semanaDe(r.createdMs);
    porSemana.set(k, [...(porSemana.get(k) ?? []), r]);
  }
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
  const coortes = [...porSemana.entries()]
    .sort((a, b) => b[0] - a[0])
    .slice(0, 12)
    .map(([k, lista]) => {
      const fimSemana = k + 7 * D;
      const maduraD7 = now - fimSemana >= 7 * D;
      const maduraD1 = now - fimSemana >= 1 * D;
      const ativaram = lista.filter((r) => r.total > 0).length;
      const d1 = lista.filter((r) => r.lastMs - r.createdMs >= 1 * D).length;
      const d7 = lista.filter((r) => r.lastMs - r.createdMs >= 7 * D).length;
      const ini = new Date(k);
      return {
        semana: `${String(ini.getUTCDate()).padStart(2, "0")}/${String(ini.getUTCMonth() + 1).padStart(2, "0")}`,
        aberto: k >= semanaDe(VINKE_ABERTO_INICIO.getTime()),
        cadastros: lista.length,
        ativaram,
        ativaramPct: pct(ativaram, lista.length),
        d1: maduraD1 ? d1 : null,
        d1Pct: maduraD1 ? pct(d1, lista.length) : null,
        d7: maduraD7 ? d7 : null,
        d7Pct: maduraD7 ? pct(d7, lista.length) : null,
      };
    });

  const ativos7d = rows.filter((r) => r.lastMs && now - r.lastMs < 7 * D).length;
  const ativosHoje = rows.filter((r) => r.lastMs && now - r.lastMs < 1 * D).length;
  return NextResponse.json({ ok: true, aberto: vinkeAbertoAtivo(), total: rows.length, ativos7d, ativosHoje, coortes });
}
