// src/app/api/cron/emails-gratuito/route.ts
// Cron diário (vercel.json, 12:00 UTC = 9h Brasília): e-mails de retorno para
// quem criou conta no plano gratuito e ainda não comprou.
//   D+1 (24–48 h após o cadastro): o que fez ontem + 3 questões que errou + Questão do dia.
//   D+3 (72–96 h): oferta do Passe Reta Final (ou Anual depois do ENEM).
// Idempotente: marca users/{uid}/meta/emails.{d1SentAt,d3SentAt}. Respeita optOut.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { sendResendEmail } from "@/lib/resend";
import { montarD1, montarD3, esc } from "@/lib/emailsGratuito";
import { processarFilaRecuperacao } from "@/lib/recuperacao";

function autorizado(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const allowed = [process.env.CRON_SECRET].map((v) => String(v ?? "").trim()).filter(Boolean);
  return allowed.length > 0 && allowed.includes(token);
}


export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    await adminDb.collection("cron_runs").add({ job: "emails-gratuito", at: new Date(), unauthorized: true, hasAuthHeader: Boolean(req.headers.get("authorization")), ua: req.headers.get("user-agent") ?? null }).catch(() => {});
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  const now = Date.now();
  const H = 3_600_000;

  const users: { uid: string; email: string; nome: string | null; createdMs: number }[] = [];
  let pageToken: string | undefined;
  do {
    const page = await adminAuth.listUsers(1000, pageToken);
    for (const u of page.users) {
      if (!u.email) continue;
      users.push({ uid: u.uid, email: u.email, nome: u.displayName ?? null, createdMs: new Date(u.metadata.creationTime).getTime() });
    }
    pageToken = page.pageToken;
  } while (pageToken);

  // Janelas largas (a marca d1SentAt/d3SentAt garante um envio só por pessoa):
  // D+1 entre 24 h e 3 dias; D+3 entre 3 e 12 dias. Assim ninguém fica de fora
  // se o cron falhar um dia ou se a pessoa entrou antes do cron existir.
  const alvoD1 = users.filter((u) => now - u.createdMs >= 24 * H && now - u.createdMs < 72 * H);
  const alvoD3 = users.filter((u) => now - u.createdMs >= 72 * H && now - u.createdMs < 12 * 24 * H);

  // ?preview=d1|d3 devolve o HTML do primeiro candidato, sem enviar nada.
  const preview = req.nextUrl.searchParams.get("preview");
  if (preview === "d1" || preview === "d3") {
    const u = (preview === "d1" ? alvoD1 : alvoD3)[0] ?? users[0];
    if (!u) return NextResponse.json({ ok: false, error: "sem usuários" }, { status: 404 });
    const msg = preview === "d1" ? await montarD1(u.uid, u.email, u.nome) : montarD3(u.email, u.nome);
    return new NextResponse(`<!doctype html><title>${msg.subject}</title><p style="font:12px monospace;color:#888">assunto: ${esc(msg.subject)}</p>${msg.html}`, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const resultado: {
    d1: { enviados: number; pulados: number; erros: number };
    d3: { enviados: number; pulados: number; erros: number };
    dryRun: boolean;
    limitePorExecucao?: number;
    adiados?: { d1: number; d3: number };
    recuperacao?: number;
  } = { d1: { enviados: 0, pulados: 0, erros: 0 }, d3: { enviados: 0, pulados: 0, erros: 0 }, dryRun };

  const errosDetalhe: string[] = [];
  // Envia em lotes de 6 em paralelo: 148 e-mails sequenciais levaram 59,7 s,
  // no limite de 60 s do plano Hobby.
  async function processar(lista: typeof users, tipo: "d1" | "d3") {
    const LOTE = 6;
    for (let i = 0; i < lista.length; i += LOTE) {
      await Promise.all(lista.slice(i, i + LOTE).map((u) => processarUm(u, tipo)));
    }
  }

  async function processarUm(u: (typeof users)[number], tipo: "d1" | "d3") {
    {
      const r = resultado[tipo];
      try {
        const [ent, meta] = await Promise.all([
          adminDb.doc(`entitlements/${u.uid}`).get(),
          adminDb.doc(`users/${u.uid}/meta/emails`).get(),
        ]);
        const plan = String(ent.data()?.plan ?? "");
        const m = (meta.data() ?? {}) as Record<string, unknown>;
        if (plan !== "gratuito" || m.optOut || m[`${tipo}SentAt`]) {
          r.pulados++;
          return;
        }
        const msg = tipo === "d1" ? await montarD1(u.uid, u.email, u.nome) : montarD3(u.email, u.nome);
        if (!dryRun) {
          await sendResendEmail({ to: u.email, subject: msg.subject, html: msg.html });
          await adminDb.doc(`users/${u.uid}/meta/emails`).set({ [`${tipo}SentAt`]: new Date(), [`${tipo}Subject`]: msg.subject }, { merge: true });
        }
        r.enviados++;
      } catch (e) {
        r.erros++;
        const msg = e instanceof Error ? e.message : String(e);
        errosDetalhe.push(`${tipo} ${u.email}: ${msg.slice(0, 160)}`);
        console.error(`[emails-gratuito] ${tipo} ${u.uid}:`, msg);
      }
    }
  }

  // Plano gratuito do Resend: 100 e-mails/dia (3.000/mês). Guardamos folga para
  // os e-mails transacionais (senha, boas-vindas). Quem ficar de fora hoje entra
  // amanhã, porque as janelas são largas e a marca d1/d3SentAt só é gravada no envio.
  const MAX_POR_EXECUCAO = Number(process.env.EMAILS_GRATUITO_MAX ?? 80);
  const inicio = Date.now();
  const fila1 = alvoD1.slice(0, MAX_POR_EXECUCAO);
  const fila3 = alvoD3.slice(0, Math.max(0, MAX_POR_EXECUCAO - fila1.length));
  resultado.limitePorExecucao = MAX_POR_EXECUCAO;
  resultado.adiados = { d1: alvoD1.length - fila1.length, d3: alvoD3.length - fila3.length };
  // Recuperação de faturas abertas primeiro: é quem já tentou comprar.
  const recup = dryRun ? { enviados: 0, erros: [] as string[] } : await processarFilaRecuperacao(Math.min(20, MAX_POR_EXECUCAO));
  resultado.recuperacao = recup.enviados;
  errosDetalhe.push(...recup.erros);
  await processar(fila1, "d1");
  await processar(fila3, "d3");

  // Registro da execução para auditoria sem depender dos logs da Vercel.
  await adminDb
    .collection("cron_runs")
    .add({
      job: "emails-gratuito",
      at: new Date(),
      dryRun,
      candidatos: { d1: alvoD1.length, d3: alvoD3.length },
      resultado,
      errosDetalhe: errosDetalhe.slice(0, 20),
      duracaoMs: Date.now() - inicio,
      trigger: req.headers.get("user-agent")?.includes("vercel-cron") ? "vercel-cron" : "manual",
    })
    .catch(() => {});

  return NextResponse.json({ ok: true, candidatos: { d1: alvoD1.length, d3: alvoD3.length }, ...resultado, errosDetalhe: errosDetalhe.slice(0, 5) });
}
