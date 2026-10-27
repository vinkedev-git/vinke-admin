// src/app/api/admin/emails-gratuito/route.ts
// GET  → últimas execuções do cron (cron_runs) para o card do admin.
// POST → envia o e-mail D+1 ou D+3 de teste para o próprio admin logado.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { sendResendEmail } from "@/lib/resend";
import { montarD1, montarD3 } from "@/lib/emailsGratuito";

export async function GET(req: NextRequest) {
  const check = await requireAdmin(req);
  if ("error" in check) return check.error;
  const snap = await adminDb.collection("cron_runs").orderBy("at", "desc").limit(8).get();
  const runs = snap.docs
    .map((d) => d.data())
    .filter((x) => x.job === "emails-gratuito" && !String(x.ua ?? "").includes("curl"))
    .map((x) => ({
      at: x.at?.toDate?.()?.toISOString?.() ?? null,
      trigger: x.trigger ?? (x.unauthorized ? "recusado" : null),
      unauthorized: Boolean(x.unauthorized),
      candidatos: x.candidatos ?? null,
      resultado: x.resultado ?? null,
      erros: x.errosDetalhe ?? [],
      duracaoMs: x.duracaoMs ?? null,
    }));
  return NextResponse.json({ ok: true, runs });
}

export async function POST(req: NextRequest) {
  const check = await requireAdmin(req);
  if ("error" in check) return check.error;
  const body = (await req.json().catch(() => ({}))) as { tipo?: string };
  const tipo = body.tipo === "d3" ? "d3" : "d1";
  const user = await adminAuth.getUser(check.adminUid);
  if (!user.email) return NextResponse.json({ ok: false, error: "Admin sem e-mail" }, { status: 400 });
  try {
    const msg = tipo === "d1" ? await montarD1(user.uid, user.email, user.displayName ?? null) : montarD3(user.email, user.displayName ?? null);
    await sendResendEmail({ to: user.email, subject: `[teste] ${msg.subject}`, html: msg.html });
    return NextResponse.json({ ok: true, enviadoPara: user.email, assunto: msg.subject });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
