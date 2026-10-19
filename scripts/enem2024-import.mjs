// Importa o ENEM 2024 a partir do dataset maritaca-ai/enem (Apache-2.0).
//
// Uso: node scripts/enem2024-import.mjs [--dry]
//
// Por que esta fonte: a api.enem.dev para em 2023. O dataset da Maritaca tem a
// prova de 2024 completa (180 questões) com gabarito, e os gabaritos de 2022-23
// foram conferidos 1:1 contra o nosso banco (que já tinha sido batido no INEP).
//
// Formato de origem: {id, exam, IU, ledor, question, alternatives, figures,
// description, label}. O enunciado traz [[placeholder]] onde entra cada imagem;
// as imagens de figures[] são consumidas EM ORDEM, primeiro os placeholders do
// enunciado, depois os das alternativas (A→E). As descrições do caderno de
// acessibilidade viram o alt= da imagem.
//
// Área sai do índice (estrutura fixa do ENEM); disciplina/assunto ficam null
// para o classify-questions.mjs resolver depois. Imagens apontam para o GitHub
// da fonte até rodar o img-migrate.mjs.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
admin.initializeApp({
  credential: admin.credential.cert(
    require("/Users/davidrangel/Projetos/EnemQuest/.secrets/vinke-74695-firebase-adminsdk-fbsvc-374e2db752.json")
  ),
});
const db = admin.firestore();
const DRY = process.argv.includes("--dry");

const DIR = "/private/tmp/claude-501/-Users-davidrangel-Projetos-EnemQuest/098ce75e-0fc4-4db5-92cd-83cca59210d5/scratchpad/m2024";
mkdirSync(DIR, { recursive: true });
const SRC = `${DIR}/2024.jsonl`;
if (!existsSync(SRC)) {
  console.error(`Falta ${SRC}. Baixe com:\n  curl -sL -o ${SRC} https://huggingface.co/datasets/maritaca-ai/enem/resolve/main/2024.jsonl`);
  process.exit(1);
}

// ─── Área pelo índice (dia 1: 1-45 Linguagens, 46-90 Humanas; dia 2: 91-135
// Natureza, 136-180 Matemática). As 5 primeiras são língua estrangeira — neste
// dataset, a versão em inglês da prova.
const AREAS = [
  [1, 5, "area-linguagens", "Linguagens, Códigos e suas Tecnologias"],
  [6, 45, "area-linguagens", "Linguagens, Códigos e suas Tecnologias"],
  [46, 90, "area-humanas", "Ciências Humanas e suas Tecnologias"],
  [91, 135, "area-natureza", "Ciências da Natureza e suas Tecnologias"],
  [136, 180, "area-matematica", "Matemática e suas Tecnologias"],
];
const areaDe = (i) => AREAS.find(([lo, hi]) => i >= lo && i <= hi);

const ING = {
  disciplina: "Inglês", disciplinaId: "disc-ingles",
  level: "Inglês", levelId: "disc-ingles", nivel: "Inglês",
  assuntos: ["Interpretação de texto em inglês"],
  assuntoIds: ["ass-ingles-interpretacao-de-texto-em-ingles"],
  themes: ["Interpretação de texto em inglês"],
  themeIds: ["ass-ingles-interpretacao-de-texto-em-ingles"],
};

// ─── Markdown da fonte -> HTML ───────────────────────────────────────────────
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(s) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,;:!?)]|$)/g, "$1<em>$2</em>");
}

// Tabela em pipes -> <table>. A 2ª linha (|:---|---|) é só alinhamento.
function tabelaHtml(linhas) {
  const celulas = (l) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const corpo = linhas.filter((l) => !/^\|[\s:|-]+\|?$/.test(l));
  if (!corpo.length) return "";
  const [cab, ...resto] = corpo.map(celulas);
  // "Unnamed: N" é lixo de exportação de planilha da fonte
  const limpo = (c) => (/^Unnamed:\s*\d+$/.test(c) ? "" : inline(esc(c)));
  const th = `<tr>${cab.map((c) => `<th>${limpo(c)}</th>`).join("")}</tr>`;
  const tr = resto.map((r) => `<tr>${r.map((c) => `<td>${limpo(c)}</td>`).join("")}</tr>`).join("");
  return `<table><thead>${th}</thead><tbody>${tr}</tbody></table>`;
}

// Consome figures[] na ordem em que os [[placeholder]] aparecem.
function fazConsumidor(figures, descriptions) {
  let i = 0;
  return () => {
    const url = figures[i];
    const alt = (descriptions && descriptions[i]) || "";
    i++;
    if (!url) return "";
    return `<img src="${url}" alt="${esc(alt).replace(/"/g, "&quot;")}" style="max-width:100%">`;
  };
}

// O comando da questão ("…o autor pretende") é a última linha do enunciado e
// quase nunca vem separado por linha em branco na fonte (166 de 180 em 2024).
// Sem isto ele sai grudado no texto por um <br>, que é como o aluno leria.
function indiceDoComando(linhas) {
  for (let i = linhas.length - 1; i >= 0; i--) {
    const l = linhas[i];
    if (!l.trim()) continue;
    if (l.includes("[[placeholder]]") || /^\s*\|/.test(l)) return -1;
    return i;
  }
  return -1;
}

function enunciadoHtml(texto, proximaImagem) {
  const linhas = String(texto || "").split("\n");
  const iComando = indiceDoComando(linhas);
  const out = [];
  let paragrafo = [];
  let tabela = [];
  const fechaParagrafo = () => {
    if (!paragrafo.length) return;
    const h = paragrafo.map((l) => inline(esc(l))).join("<br>");
    if (h.trim()) out.push(`<p>${h}</p>`);
    paragrafo = [];
  };
  const fechaTabela = () => { if (tabela.length) { out.push(tabelaHtml(tabela)); tabela = []; } };

  for (let n = 0; n < linhas.length; n++) {
    const linha = linhas[n];
    if (n === iComando) {
      fechaParagrafo(); fechaTabela();
      out.push(`<p>${inline(esc(linha.trim()))}</p>`);
      continue;
    }
    if (/^\s*\|/.test(linha)) { fechaParagrafo(); tabela.push(linha.trim()); continue; }
    fechaTabela();
    if (!linha.trim()) { fechaParagrafo(); continue; }
    if (linha.includes("[[placeholder]]")) {
      fechaParagrafo();
      const partes = linha.split("[[placeholder]]");
      partes.forEach((p, k) => {
        if (p.trim()) out.push(`<p>${inline(esc(p))}</p>`);
        if (k < partes.length - 1) { const img = proximaImagem(); if (img) out.push(`<p>${img}</p>`); }
      });
      continue;
    }
    const t = linha.match(/^(#{1,6})\s+(.*)$/);
    if (t) { fechaParagrafo(); out.push(`<p><strong>${inline(esc(t[2]))}</strong></p>`); continue; }
    paragrafo.push(linha);
  }
  fechaParagrafo(); fechaTabela();
  return out.join("");
}

// ─── Monta os docs ───────────────────────────────────────────────────────────
const rows = readFileSync(SRC, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const existentes = new Set((await db.collection("questionsBank").select().get()).docs.map((d) => d.id));
const letras = ["A", "B", "C", "D", "E"];
const agora = new Date();
const novos = [], avisos = [];

for (const r of rows) {
  const idx = Number(String(r.id).match(/(\d+)/)[1]);
  const [, , areaId, areaNome] = areaDe(idx);
  const ehIngles = idx <= 5;
  const id = `ENEM2024_Q${String(idx).padStart(3, "0")}${ehIngles ? "_INGLES" : ""}`;
  if (existentes.has(id)) { avisos.push(`${id}: JÁ EXISTE, pulado`); continue; }

  const proximaImagem = fazConsumidor(r.figures || [], r.description || []);
  const prompt = enunciadoHtml(r.question, proximaImagem);

  const options = letras.map((L, k) => {
    const bruto = (r.alternatives || [])[k] || "";
    if (bruto.includes("[[placeholder]]")) {
      const img = proximaImagem();
      const url = (img.match(/src="([^"]+)"/) || [])[1] || null;
      return { id: L, text: "", imageUrl: url, imageWidth: 100 };
    }
    return { id: L, text: inline(esc(bruto)), imageUrl: null, imageWidth: 100 };
  });

  const anulada = !letras.includes(r.label);
  const doc = {
    examId: "enem", examType: "ENEM", prova_tipo: "ENEM",
    examYear: 2024, prova_ano: 2024, enemIndex: idx,
    reference: `ENEM 2024 · Questão ${idx}`,
    examSource: "(ENEM-2024)", Prova: "(ENEM-2024)",
    enemLanguage: ehIngles ? "ingles" : null,
    area: areaNome, areaId,
    ...(ehIngles
      ? { ...ING, classifiedAt: agora, classifiedBy: "importador:enem2024" }
      : { disciplina: null, disciplinaId: null, level: null, levelId: null, nivel: null,
          assuntos: [], assuntoIds: [], themes: [], themeIds: [],
          classifiedAt: null, classifiedBy: null }),
    prompt, prompt_text: prompt,
    imageUrl: null, promptImageWidth: 100,
    options,
    correctOptionId: anulada ? null : r.label,
    explanation: "", explanationFormat: "html",
    explanationSource: null, explainedBy: null,
    isActive: !anulada,
    status: anulada ? "inativo" : "ativo",
    shuffleOptions: false,
    dificuldade: null, commentAttachments: [],
    internalNote: anulada
      ? "Questão ANULADA pelo INEP no ENEM 2024 — importada para manter a prova completa, mas inativa (sem gabarito)."
      : "",
    importSource: "maritaca-ai/enem",
    createdAt: agora, updatedAt: agora,
  };
  letras.forEach((L, k) => {
    doc[`option${L}_text`] = options[k].text;
    doc[`option${L}_imageUrl`] = options[k].imageUrl;
  });

  // conferências
  if (!anulada && !letras.includes(doc.correctOptionId)) avisos.push(`${id}: gabarito inválido`);
  if (options.some((o) => !o.text && !o.imageUrl)) avisos.push(`${id}: alternativa vazia`);
  if (prompt.length < 80) avisos.push(`${id}: enunciado curto (${prompt.length})`);
  if (prompt.includes("[[placeholder]]")) avisos.push(`${id}: placeholder não substituído`);
  const usadas = (prompt.match(/<img /g) || []).length + options.filter((o) => o.imageUrl).length;
  if (usadas !== (r.figures || []).length) avisos.push(`${id}: ${usadas} imagens usadas de ${(r.figures || []).length}`);

  novos.push({ id, doc });
}

const porArea = {};
novos.forEach(({ doc }) => { porArea[doc.area] = (porArea[doc.area] || 0) + 1; });
console.log("A criar:", novos.length);
Object.entries(porArea).forEach(([a, n]) => console.log(`  ${a}: ${n}`));
console.log("  inativa (anulada):", novos.filter((n) => !n.doc.isActive).length);
console.log("  com imagem no enunciado:", novos.filter((n) => n.doc.prompt.includes("<img")).length);
console.log("  com alternativa em imagem:", novos.filter((n) => letras.some((L) => n.doc[`option${L}_imageUrl`])).length);
console.log("  com tabela:", novos.filter((n) => n.doc.prompt.includes("<table")).length);
if (avisos.length) { console.log("\nAVISOS:"); avisos.forEach((a) => console.log("  -", a)); }
else console.log("\nAVISOS: nenhum");

writeFileSync(`${DIR}/novos.json`, JSON.stringify(novos, null, 1));
console.log(`\nprévia em ${DIR}/novos.json`);
if (DRY) { console.log("\n[DRY] nada gravado."); process.exit(0); }

for (let i = 0; i < novos.length; i += 400) {
  const b = db.batch();
  novos.slice(i, i + 400).forEach(({ id, doc }) => b.set(db.doc(`questionsBank/${id}`), doc));
  await b.commit();
  console.log(`  ${Math.min(i + 400, novos.length)}/${novos.length} gravadas`);
}
console.log("\nFIM. Próximos: img-migrate.mjs -> classify-questions.mjs -> resoluções");
process.exit(0);
