// src/app/api/cron/emails-gratuito/route.ts
// Cron diário (vercel.json, 12:00 UTC = 9h Brasília): e-mails de retorno para
// quem criou conta no plano gratuito e ainda não comprou.
//   D+1 (24–48 h após o cadastro): o que fez ontem + 3 questões que errou + Questão do dia.
//   D+3 (72–96 h): oferta do Passe Reta Final (ou Anual depois do ENEM).
//   Abertura: disparo único para toda a base gratuita na 1ª semana do Vinke
//     aberto, em rampa por dia (40 / 120 / resto), dos mais engajados primeiro.
//   Retorno: quem já treinou e parou há 3+ dias, enquanto o Vinke aberto durar.
// Idempotente: marca users/{uid}/meta/emails.{d1SentAt,d3SentAt,aberturaSentAt,
// retornoSentAt}. Respeita optOut.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { sendResendEmail } from "@/lib/resend";
import { montarD1, montarD3, montarRetorno, montarAbertura, esc, vinkeAbertoAtivo, VINKE_ABERTO_INICIO } from "@/lib/emailsGratuito";
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
  if (preview === "d1" || preview === "d3" || preview === "abertura") {
    const u = (preview === "d1" ? alvoD1 : preview === "d3" ? alvoD3 : users)[0] ?? users[0];
    if (!u) return NextResponse.json({ ok: false, error: "sem usuários" }, { status: 404 });
    const msg =
      preview === "d1" ? await montarD1(u.uid, u.email, u.nome)
      : preview === "d3" ? montarD3(u.email, u.nome)
      : await montarAbertura(u.uid, u.email, u.nome);
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
    abertura?: { diaCampanha: number; teto: number; elegiveis: number; enviados: number; erros: number };
    retorno?: { candidatos: number; enviados: number; erros: number };
  } = { d1: { enviados: 0, pulados: 0, erros: 0 }, d3: { enviados: 0, pulados: 0, erros: 0 }, dryRun };

  const errosDetalhe: string[] = [];
  // Envia em lotes de 6 em paralelo: 148 e-mails sequenciais levaram 59,7 s,
  // no limite de 60 s do plano Hobby.
  // A Resend aceita 10 req/s. Lotes de 6 disparados em sequência, sem pausa,
  // estouravam o limite (52 envios perderam-se num 429 em 04/11/2026). O
  // sendResendEmail já reenvia, mas é melhor não provocar: cada lote ocupa no
  // mínimo uma janela, o que deixa o ritmo em ~6 req/s.
  const JANELA_LOTE_MS = 1000;
  async function comRitmo<T>(itens: T[], tamanho: number, fn: (x: T) => Promise<unknown>) {
    for (let i = 0; i < itens.length; i += tamanho) {
      const t0 = Date.now();
      await Promise.all(itens.slice(i, i + tamanho).map(fn));
      const resta = JANELA_LOTE_MS - (Date.now() - t0);
      if (resta > 0 && i + tamanho < itens.length) {
        await new Promise((r) => setTimeout(r, resta));
      }
    }
  }

  async function processar(lista: typeof users, tipo: "d1" | "d3") {
    await comRitmo(lista, 6, (u) => processarUm(u, tipo));
  }

  // Quem ainda não recebeu este e-mail (plano gratuito, sem opt-out, sem marca
  // de envio). Filtrar ANTES de aplicar o teto: até 3/11 o teto cortava a lista
  // bruta, e como a ordem dos usuários é sempre a mesma, os primeiros N já
  // enviados ocupavam a cota todo dia e o D+3 só saía para 2–8 pessoas por dia
  // enquanto 150+ ficavam "adiadas" até sair da janela.
  async function elegiveis(lista: typeof users, tipo: "d1" | "d3") {
    const ok: typeof users = [];
    const LOTE = 20;
    for (let i = 0; i < lista.length; i += LOTE) {
      const parte = lista.slice(i, i + LOTE);
      const flags = await Promise.all(
        parte.map(async (u) => {
          const [ent, meta] = await Promise.all([
            adminDb.doc(`entitlements/${u.uid}`).get(),
            adminDb.doc(`users/${u.uid}/meta/emails`).get(),
          ]);
          const plan = String(ent.data()?.plan ?? "");
          const m = (meta.data() ?? {}) as Record<string, unknown>;
          return plan === "gratuito" && !m.optOut && !m[`${tipo}SentAt`];
        }),
      );
      parte.forEach((u, j) => (flags[j] ? ok.push(u) : resultado[tipo].pulados++));
    }
    return ok;
  }

  async function processarUm(u: (typeof users)[number], tipo: "d1" | "d3") {
    {
      const r = resultado[tipo];
      try {
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
  const [elegD1, elegD3] = await Promise.all([elegiveis(alvoD1, "d1"), elegiveis(alvoD3, "d3")]);
  // O D+3 é o e-mail que vende; garante a ele pelo menos 40% da cota quando há fila.
  const reservaD3 = Math.min(Math.floor(MAX_POR_EXECUCAO * 0.4), elegD3.length);
  const fila1 = elegD1.slice(0, Math.max(0, MAX_POR_EXECUCAO - reservaD3));
  const fila3 = elegD3.slice(0, Math.max(0, MAX_POR_EXECUCAO - fila1.length));
  resultado.limitePorExecucao = MAX_POR_EXECUCAO;
  resultado.adiados = { d1: elegD1.length - fila1.length, d3: elegD3.length - fila3.length };
  // Recuperação de faturas abertas primeiro: é quem já tentou comprar.
  const recup = dryRun ? { enviados: 0, erros: [] as string[] } : await processarFilaRecuperacao(Math.min(20, MAX_POR_EXECUCAO));
  resultado.recuperacao = recup.enviados;
  errosDetalhe.push(...recup.erros);
  await processar(fila1, "d1");
  await processar(fila3, "d3");

  // ── Abertura do Vinke aberto: um disparo para toda a base gratuita ──────
  // Em rampa por dias, porque o cron roda uma vez ao dia: 40, depois 120, e aí
  // o resto. Mandar 400 de uma vez num domínio que vinha de ~200/dia é como se
  // queima reputação de IP — e a lista inteira passa a cair em spam.
  const RAMPA_ABERTURA = [40, 120, 400];
  const DIA_MS = 24 * H;
  const diaCampanha = Math.floor((now - VINKE_ABERTO_INICIO.getTime()) / DIA_MS);
  let enviadosAbertura = 0;
  // Só na primeira semana da campanha: depois disso quem nunca abriu o e-mail
  // volta a ser assunto do e-mail de retorno, que é recorrente.
  if (vinkeAbertoAtivo() && diaCampanha >= 0 && diaCampanha <= 6) {
    const ab = { diaCampanha, teto: 0, elegiveis: 0, enviados: 0, erros: 0 };
    const sobra = MAX_POR_EXECUCAO - fila1.length - fila3.length - recup.enviados;
    ab.teto = Math.max(0, Math.min(RAMPA_ABERTURA[Math.min(diaCampanha, RAMPA_ABERTURA.length - 1)], sobra));

    if (ab.teto > 0) {
      // Só quem já existia quando a campanha começou: quem se cadastra durante
      // o Vinke aberto nunca viu o limite de 10, e "o limite caiu" não faz
      // sentido como primeiro e-mail dessa pessoa.
      const base = users.filter((u) => u.createdMs < VINKE_ABERTO_INICIO.getTime());
      const cands: { u: (typeof users)[number]; respondidas: number }[] = [];
      const LOTE = 20;
      for (let i = 0; i < base.length; i += LOTE) {
        const parte = base.slice(i, i + LOTE);
        const infos = await Promise.all(
          parte.map(async (u) => {
            const [ent, st, em] = await Promise.all([
              adminDb.doc(`entitlements/${u.uid}`).get(),
              adminDb.doc(`users/${u.uid}/meta/stats`).get(),
              adminDb.doc(`users/${u.uid}/meta/emails`).get(),
            ]);
            const plan = String(ent.data()?.plan ?? "");
            const m = (em.data() ?? {}) as Record<string, unknown>;
            if (plan !== "gratuito" || m.optOut || m.aberturaSentAt) return null;
            return { u, respondidas: Number((st.data() ?? {}).totalAnswered ?? 0) };
          }),
        );
        for (const c of infos) if (c) cands.push(c);
      }
      // Quem mais respondeu primeiro: é para quem o texto fala (bateu no muro
      // das 10) e é a parte mais engajada da lista, que é por onde se deve
      // começar uma rampa — os primeiros lotes é que constroem a reputação.
      cands.sort((a, b) => b.respondidas - a.respondidas);
      ab.elegiveis = cands.length;
      await comRitmo(cands.slice(0, ab.teto), 6, async ({ u }) => {
        try {
          const msg = await montarAbertura(u.uid, u.email, u.nome);
          if (!dryRun) {
            await sendResendEmail({ to: u.email, subject: msg.subject, html: msg.html });
            await adminDb.doc(`users/${u.uid}/meta/emails`).set({ aberturaSentAt: new Date(), aberturaSubject: msg.subject }, { merge: true });
          }
          ab.enviados++;
        } catch (e) {
          ab.erros++;
          errosDetalhe.push(`abertura ${u.email}: ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`);
        }
      });
      enviadosAbertura = ab.enviados;
    }
    resultado.abertura = ab;
  }

  // ── Vinke aberto: e-mail de retorno para quem parou há 3+ dias ──────────
  // Usa a cota que sobrou do dia. Um por pessoa a cada 7 dias; quem parou há
  // menos tempo vem primeiro (é quem volta mais fácil).
  const restante = MAX_POR_EXECUCAO - fila1.length - fila3.length - recup.enviados - enviadosAbertura;
  if (vinkeAbertoAtivo() && restante > 0 && !dryRun) {
    const D = 24 * H;
    const retorno = { candidatos: 0, enviados: 0, erros: 0 };
    const base = users.filter((u) => now - u.createdMs >= 3 * D);
    const cands: { u: (typeof users)[number]; parado: number; lastMs: number }[] = [];
    const LOTE = 20;
    for (let i = 0; i < base.length; i += LOTE) {
      const parte = base.slice(i, i + LOTE);
      const infos = await Promise.all(
        parte.map(async (u) => {
          const [ent, st, em] = await Promise.all([
            adminDb.doc(`entitlements/${u.uid}`).get(),
            adminDb.doc(`users/${u.uid}/meta/stats`).get(),
            adminDb.doc(`users/${u.uid}/meta/emails`).get(),
          ]);
          const plan = String(ent.data()?.plan ?? "");
          const s = (st.data() ?? {}) as { totalAnswered?: unknown; lastAnswerAt?: { toMillis?: () => number } };
          const m = (em.data() ?? {}) as { optOut?: unknown; retornoSentAt?: { toMillis?: () => number }; aberturaSentAt?: { toMillis?: () => number } };
          const lastMs = s.lastAnswerAt?.toMillis?.() ?? 0;
          const sentMs = m.retornoSentAt?.toMillis?.() ?? 0;
          // Quem acabou de receber a abertura não leva o retorno na sequência:
          // são dois pedidos de volta na mesma semana, e o segundo só irrita.
          const abMs = m.aberturaSentAt?.toMillis?.() ?? 0;
          const ok = plan === "gratuito" && !m.optOut && Number(s.totalAnswered ?? 0) > 0 && lastMs > 0 && now - lastMs >= 3 * D && (!sentMs || now - sentMs >= 7 * D) && (!abMs || now - abMs >= 7 * D);
          return ok ? { u, parado: Math.floor((now - lastMs) / D), lastMs } : null;
        }),
      );
      for (const c of infos) if (c) cands.push(c);
    }
    cands.sort((a, b) => b.lastMs - a.lastMs);
    retorno.candidatos = cands.length;
    const fila = cands.slice(0, restante);
    await comRitmo(fila, 6, async ({ u, parado }) => {
      try {
        const msg = await montarRetorno(u.uid, u.email, u.nome, parado);
        await sendResendEmail({ to: u.email, subject: msg.subject, html: msg.html });
        await adminDb.doc(`users/${u.uid}/meta/emails`).set({ retornoSentAt: new Date(), retornoSubject: msg.subject }, { merge: true });
        retorno.enviados++;
      } catch (e) {
        retorno.erros++;
        errosDetalhe.push(`retorno ${u.email}: ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`);
      }
    });
    resultado.retorno = retorno;
  }

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
