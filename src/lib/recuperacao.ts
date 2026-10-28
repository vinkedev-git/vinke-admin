// src/lib/recuperacao.ts
// Recuperação de vendas: carrinho abandonado (evento do Checkout Sun) e
// fatura gerada e não paga (invoice_opened / invoice_recovering).
// Registra em `recuperacao/{id}` e envia o e-mail com o link de pagamento.
//   - carrinho: e-mail enviado na hora em que a Eduzz avisa (ela já espera ~1 h).
//   - fatura:   entra na fila; o cron das 9h cobra uma vez se ainda não foi paga.
import { adminDb } from "@/lib/firebaseAdmin";
import { sendResendEmail } from "@/lib/resend";
import { esc, layout, checkout, diasParaEnem } from "@/lib/emailsGratuito";

const CHECKOUT_POR_PRODUTO: Record<string, { nome: string; url: string; preco: string }> = {
  "3123434": { nome: "Passe Reta Final", url: "https://sun.eduzz.com/G96RR56EW1", preco: "R$ 49,90" },
  "3123438": { nome: "Plano Mensal", url: "https://sun.eduzz.com/1W322JN592", preco: "R$ 34,90/mês" },
  "3123436": { nome: "Plano Anual", url: "https://sun.eduzz.com/40QRRBZ19B", preco: "12x R$ 19,90" },
};
const PRODUTO_PADRAO = CHECKOUT_POR_PRODUTO["3123434"];

type Src = Record<string, any>;
const str = (...v: unknown[]) => {
  for (const x of v) if (typeof x === "string" && x.trim()) return x.trim();
  for (const x of v) if (typeof x === "number") return String(x);
  return "";
};
const emailDe = (s: Src) =>
  str(s?.student?.email, s?.customer?.email, s?.buyer?.email, s?.client?.email, s?.lead?.email, s?.email, s?.edz_cli_email).toLowerCase();
const nomeDe = (s: Src) => str(s?.student?.name, s?.customer?.name, s?.buyer?.name, s?.client?.name, s?.lead?.name, s?.name, s?.edz_cli_nome) || null;
const produtoDe = (s: Src) => {
  const item = Array.isArray(s?.items) ? s.items[0] : null;
  const id = str(s?.product?.id, s?.productId, s?.product_id, item?.productId, item?.product?.id, s?.edz_prd_cod, s?.product_cod);
  const titulo = str(s?.product?.name, s?.product?.title, s?.productName, item?.productName, item?.product?.name, s?.edz_prd_nome);
  return { id: id || null, titulo: titulo || null };
};
const urlPagamentoDe = (s: Src) =>
  str(s?.paymentUrl, s?.payment_url, s?.invoice?.paymentUrl, s?.invoice?.url, s?.checkoutUrl, s?.checkout_url, s?.cart?.url, s?.url, s?.edz_fat_url) || null;

export type Recuperacao = {
  tipo: "carrinho" | "fatura";
  email: string;
  nome: string | null;
  productId: string | null;
  productTitle: string | null;
  invoiceId: string | null;
  urlPagamento: string | null;
  metodo: string | null;
  evento: string;
  createdAt: Date;
  pago?: boolean;
  emailEnviadoAt?: Date | null;
  erro?: string | null;
};

/** Monta o registro a partir do payload da Eduzz. Retorna null se não houver e-mail. */
const EMAIL_DE_TESTE = /@(example\.com|example\.org|test\.com|eduzz\.com|mailinator\.com)$/i;

export function extrairRecuperacao(tipo: "carrinho" | "fatura", evento: string, sourceData: Src): Recuperacao | null {
  const email = emailDe(sourceData);
  if (!email || !email.includes("@")) return null;
  // Payloads de teste da Eduzz vêm com e-mails fictícios: não registrar nem cobrar.
  if (EMAIL_DE_TESTE.test(email)) return null;
  const { id, titulo } = produtoDe(sourceData);
  return {
    tipo,
    email,
    nome: nomeDe(sourceData),
    productId: id,
    productTitle: titulo,
    invoiceId: str(sourceData?.invoice?.id, sourceData?.invoice_id, sourceData?.id, sourceData?.edz_fat_cod) || null,
    urlPagamento: urlPagamentoDe(sourceData),
    metodo: str(sourceData?.paymentMethod, sourceData?.payment?.method, sourceData?.invoice?.paymentMethod) || null,
    evento,
    createdAt: new Date(),
    pago: false,
    emailEnviadoAt: null,
  };
}

function linkPagamento(r: Recuperacao) {
  const produto = (r.productId && CHECKOUT_POR_PRODUTO[r.productId]) || PRODUTO_PADRAO;
  // Fatura aberta: prefere o link da própria cobrança (Pix/boleto já emitidos).
  if (r.tipo === "fatura" && r.urlPagamento) return { produto, url: r.urlPagamento, novaCobranca: false };
  return { produto, url: checkout(produto.url, r.email, r.nome, `recuperacao-${r.tipo}`), novaCobranca: true };
}

export function montarEmailRecuperacao(r: Recuperacao) {
  const primeiro = (r.nome ?? "").split(" ")[0] || "aluno";
  const { produto, url, novaCobranca } = linkPagamento(r);
  const dias = diasParaEnem();
  const prazo = dias > 0 ? `${dias === 1 ? "Falta 1 dia" : `Faltam ${dias} dias`} para o ENEM. ` : "";
  if (r.tipo === "carrinho") {
    const corpo = `
      <p>Vi que você começou a garantir o <b>${esc(produto.nome)}</b> e não concluiu. Acontece.</p>
      <p>${prazo}O link abaixo abre o checkout com seus dados já preenchidos. Dá para pagar com <b>Pix</b> e o acesso libera na hora, no e-mail ${esc(r.email)}.</p>
      <p>Se o pagamento deu erro ou precisa que outra pessoa pague, é só encaminhar este e-mail para ela ou responder aqui que eu ajudo.</p>`;
    return {
      subject: `${primeiro}, seu ${produto.nome} ficou parado no checkout`,
      html: layout(`Falta só o último passo, ${esc(primeiro)}.`, corpo, `Concluir por ${produto.preco}`, url, "Garantia de 7 dias. Cancele quando quiser."),
    };
  }
  const metodo = (r.metodo ?? "").toLowerCase().includes("pix") ? "Pix" : (r.metodo ?? "").toLowerCase().includes("bol") ? "boleto" : "cobrança";
  const corpo = `
    <p>Você gerou um ${metodo} para o <b>${esc(produto.nome)}</b> e ele ainda não foi pago. ${metodo === "Pix" ? "Pix expira rápido, então" : "Então"} aqui está ${novaCobranca ? "um link novo para gerar outro" : "o link para pagar"}.</p>
    <p>${prazo}O acesso libera na hora do pagamento, no e-mail ${esc(r.email)}.</p>
    <p>Se preferir pagar de outro jeito ou precisa que alguém pague por você, responde este e-mail.</p>`;
  return {
    subject: `${primeiro}, seu ${metodo} do ${produto.nome} ainda não foi pago`,
    html: layout(`Seu acesso está a um ${metodo} de distância.`, corpo, `Pagar ${produto.preco}`, url, "Garantia de 7 dias."),
  };
}

/** Grava o registro e, se `enviarAgora`, dispara o e-mail. Nunca lança. */
export async function registrarRecuperacao(r: Recuperacao, enviarAgora: boolean): Promise<{ id: string; enviado: boolean; erro?: string }> {
  const ref = adminDb.collection("recuperacao").doc();
  let enviado = false;
  let erro: string | undefined;
  if (enviarAgora) {
    try {
      const msg = montarEmailRecuperacao(r);
      await sendResendEmail({ to: r.email, subject: msg.subject, html: msg.html });
      enviado = true;
      r.emailEnviadoAt = new Date();
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
      r.erro = erro;
    }
  }
  await ref.set(r).catch(() => {});
  return { id: ref.id, enviado, erro };
}

/** Marca como pagas as recuperações abertas desse e-mail (chamado no invoice_paid). */
export async function marcarRecuperacaoPaga(email: string) {
  const snap = await adminDb.collection("recuperacao").where("email", "==", email.toLowerCase()).where("pago", "==", false).get().catch(() => null);
  if (!snap || snap.empty) return 0;
  const batch = adminDb.batch();
  snap.docs.forEach((d) => batch.update(d.ref, { pago: true, pagoAt: new Date() }));
  await batch.commit().catch(() => {});
  return snap.size;
}

/**
 * Fila do cron: faturas abertas há mais de 1 h, com menos de 3 dias, não pagas,
 * sem e-mail enviado. Uma cobrança por fatura. Retorna quantos enviou.
 */
export async function processarFilaRecuperacao(max: number): Promise<{ enviados: number; erros: string[] }> {
  const agora = Date.now();
  const snap = await adminDb
    .collection("recuperacao")
    .where("tipo", "==", "fatura")
    .where("pago", "==", false)
    .where("emailEnviadoAt", "==", null)
    .limit(200)
    .get()
    .catch(() => null);
  const erros: string[] = [];
  let enviados = 0;
  if (!snap) return { enviados, erros };
  const vistos = new Set<string>();
  for (const d of snap.docs) {
    if (enviados >= max) break;
    const r = d.data() as Recuperacao & { createdAt: { toDate?: () => Date } | Date };
    const criado = (r.createdAt as { toDate?: () => Date })?.toDate?.() ?? (r.createdAt as Date);
    const idade = agora - criado.getTime();
    if (idade < 3_600_000 || idade > 3 * 86_400_000) continue;
    if (vistos.has(r.email) || EMAIL_DE_TESTE.test(r.email)) continue; // uma por pessoa por dia; nunca e-mail de teste
    vistos.add(r.email);
    try {
      const msg = montarEmailRecuperacao(r);
      await sendResendEmail({ to: r.email, subject: msg.subject, html: msg.html });
      await d.ref.update({ emailEnviadoAt: new Date() });
      enviados++;
    } catch (e) {
      erros.push(`${r.email}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160));
      await d.ref.update({ erro: erros[erros.length - 1] }).catch(() => {});
    }
  }
  return { enviados, erros };
}
