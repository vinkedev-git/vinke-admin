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

const APP = "https://aluno.vinke.app.br";
const CHECKOUT_PASSE = "https://sun.eduzz.com/G96RR56EW1";
const CHECKOUT_ANUAL = "https://sun.eduzz.com/40QRRBZ19B";
const ENEM_DIA1 = new Date("2026-11-08T13:30:00-03:00");

function autorizado(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const allowed = [process.env.CRON_SECRET].map((v) => String(v ?? "").trim()).filter(Boolean);
  return allowed.length > 0 && allowed.includes(token);
}

const diasParaEnem = () => {
  const dia = (ms: number) => Math.floor((ms - 3 * 3_600_000) / 86_400_000); // dias de calendário em Brasília
  return dia(ENEM_DIA1.getTime()) - dia(Date.now());
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function checkout(base: string, email: string, nome: string | null, origem: string) {
  const u = new URL(base);
  u.searchParams.set("email", email);
  if (nome) u.searchParams.set("name", nome);
  u.searchParams.set("utm_source", "email");
  u.searchParams.set("utm_medium", origem);
  return u.toString();
}

function layout(titulo: string, corpo: string, ctaTexto: string, ctaUrl: string, rodape: string) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.55;color:#0B0A21;max-width:560px;margin:0 auto;padding:24px 20px">
    <div style="font-weight:800;font-size:18px;letter-spacing:.01em;color:#6236F0;margin-bottom:18px">VINKE</div>
    <h1 style="font-size:22px;line-height:1.25;margin:0 0 14px">${titulo}</h1>
    ${corpo}
    <p style="margin:22px 0">
      <a href="${ctaUrl}" style="display:inline-block;padding:13px 20px;background:#6236F0;color:#fff;text-decoration:none;border-radius:10px;font-weight:700">${ctaTexto}</a>
    </p>
    <p style="font-size:12px;color:#66627F;margin:18px 0 0">${rodape}</p>
    <p style="font-size:11px;color:#9A97AE;margin:10px 0 0">Vinke é um produto de Lastro Ensino e Produção de Conteúdo · CNPJ 69.485.755/0001-20. Para não receber estes lembretes, responda este e-mail com SAIR.</p>
  </div>`;
}

type Erro = { enunciadoSnippet?: string; temas?: string[] };

async function montarD1(uid: string, email: string, nome: string | null) {
  const db = adminDb;
  const [stats, erros] = await Promise.all([
    db.doc(`users/${uid}/meta/stats`).get(),
    db.collection(`users/${uid}/errorNotebook`).where("status", "==", "pending").limit(3).get().catch(() => null),
  ]);
  const s = (stats.data() ?? {}) as Record<string, unknown>;
  const respondidas = Number(s.totalAnswered ?? 0);
  const certas = Number(s.totalCorrect ?? 0);
  const lista = (erros?.docs ?? []).map((d) => d.data() as Erro).filter((e) => e.enunciadoSnippet);

  const primeiro = (nome ?? "").split(" ")[0] || "aluno";
  let corpo = "";
  if (respondidas > 0) {
    corpo += `<p>Até agora você respondeu <b>${respondidas}</b> questões oficiais e acertou <b>${certas}</b>. Suas 10 grátis de hoje já estão liberadas.</p>`;
  } else {
    corpo += `<p>Sua conta está pronta e você tem <b>10 questões oficiais</b> liberadas hoje, com correção na hora.</p>`;
  }
  if (lista.length) {
    corpo += `<p style="margin-top:16px"><b>As que você errou e vale refazer:</b></p><ol style="padding-left:18px;margin:6px 0 0">`;
    for (const e of lista) {
      const tema = e.temas?.[0] ? ` <span style="color:#66627F">(${esc(e.temas[0])})</span>` : "";
      corpo += `<li style="margin:6px 0">${esc(String(e.enunciadoSnippet).slice(0, 140))}…${tema}</li>`;
    }
    corpo += `</ol>`;
  }
  corpo += `<p style="margin-top:16px">A <b>Questão do dia</b> de hoje também já está lá. Dois minutos e você mantém a sequência.</p>`;
  return {
    subject: respondidas > 0 ? `${primeiro}, suas 10 questões de hoje estão liberadas` : `${primeiro}, sua primeira questão do ENEM está esperando`,
    html: layout(`Bom dia, ${esc(primeiro)}.`, corpo, "Continuar treinando", `${APP}/aluno?utm_source=email&utm_medium=d1`, "Plano gratuito: 10 questões por dia e 1 simulado por semana."),
  };
}

function montarD3(email: string, nome: string | null) {
  const primeiro = (nome ?? "").split(" ")[0] || "aluno";
  const dias = diasParaEnem();
  if (dias > 0) {
    const corpo = `
      <p>${dias === 1 ? "Falta <b>1 dia</b>" : `Faltam <b>${dias} dias</b>`} para o primeiro dia do ENEM.</p>
      <p>Quem está no plano grátis treina 10 questões por dia. Até a prova, isso dá ${dias * 10}. O banco tem 2.682.</p>
      <p>O <b>Passe Reta Final</b> libera tudo até o fim da prova: questões sem limite, simulados no tempo real, plano diário e caderno de erros. <b>R$ 49,90</b>, pagamento único, sem renovação. Garantia de 7 dias.</p>`;
    return {
      subject: `${primeiro}, ${dias} dias: libere o Vinke inteiro até a prova`,
      html: layout("Reta final é hora de treinar sem freio.", corpo, "Garantir o Passe por R$ 49,90", checkout(CHECKOUT_PASSE, email, nome, "d3"), "O acesso é liberado na hora, no mesmo e-mail desta conta."),
    };
  }
  const corpo = `
    <p>O ENEM 2026 passou, e o Vinke continua: quem começa agora chega em novembro de 2027 com 12 meses de treino.</p>
    <p>O <b>Plano Anual</b> libera questões e simulados sem limite, plano diário e caderno de erros por <b>12x R$ 19,90</b>. Garantia de 7 dias.</p>`;
  return {
    subject: `${primeiro}, o ENEM 2027 começa agora`,
    html: layout("Doze meses de treino valem mais que doze semanas.", corpo, "Assinar o Anual", checkout(CHECKOUT_ANUAL, email, nome, "d3"), "Cancele quando quiser."),
  };
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

  const resultado = { d1: { enviados: 0, pulados: 0, erros: 0 }, d3: { enviados: 0, pulados: 0, erros: 0 }, dryRun };

  const errosDetalhe: string[] = [];
  async function processar(lista: typeof users, tipo: "d1" | "d3") {
    for (const u of lista) {
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
          continue;
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

  const inicio = Date.now();
  await processar(alvoD1, "d1");
  await processar(alvoD3, "d3");

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
