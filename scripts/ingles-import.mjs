// Importa as questões de INGLÊS do ENEM (api.enem.dev) que nunca entraram no
// banco: a importação original só puxou ?language=espanhol, então as 5 vagas
// de língua estrangeira de cada ano ficaram só com espanhol.
//
// Uso: node scripts/ingles-import.mjs [--dry]
//
// Desenho:
// - Baixa em lote (limit=50 é o teto da API) com retry, e faz cache em disco:
//   reexecutar não repete download.
// - IDs novos: ENEM{ano}_Q{NNN}_INGLES (o slug da LP já trata sufixo genérico,
//   vira enem-AAAA-questao-N-ingles, sem colidir com -espanhol).
// - NÃO sobrescreve doc existente (nem os corrigidos à mão contra o INEP).
// - Também corrige 4 questões das vagas de língua que estavam na disciplina
//   errada (3 de inglês como Língua Portuguesa, 1 de espanhol como Literatura).
// - Imagens continuam apontando para a enem.dev; rodar img-migrate.mjs depois.

import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
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

const CACHE = "/private/tmp/claude-501/-Users-davidrangel-Projetos-EnemQuest/098ce75e-0fc4-4db5-92cd-83cca59210d5/scratchpad/ingles";
mkdirSync(CACHE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Taxonomia fixa (já existe em /taxonomia) ────────────────────────────────
const ING = {
  area: "Linguagens, Códigos e suas Tecnologias",
  areaId: "area-linguagens",
  disciplina: "Inglês", disciplinaId: "disc-ingles",
  level: "Inglês", levelId: "disc-ingles", nivel: "Inglês",
  assuntos: ["Interpretação de texto em inglês"],
  assuntoIds: ["ass-ingles-interpretacao-de-texto-em-ingles"],
  themes: ["Interpretação de texto em inglês"],
  themeIds: ["ass-ingles-interpretacao-de-texto-em-ingles"],
};

// Vagas de língua estrangeira que entraram na disciplina errada.
const RECLASSIFICAR = {
  ENEM2011_Q092: ING, ENEM2011_Q094: ING, ENEM2015_Q095: ING,
  ENEM2020_Q005: {
    area: ING.area, areaId: ING.areaId,
    disciplina: "Espanhol", disciplinaId: "disc-espanhol",
    level: "Espanhol", levelId: "disc-espanhol", nivel: "Espanhol",
    assuntos: ["Interpretação de texto em espanhol"],
    assuntoIds: ["ass-espanhol-interpretacao-de-texto-em-espanhol"],
    themes: ["Interpretação de texto em espanhol"],
    themeIds: ["ass-espanhol-interpretacao-de-texto-em-espanhol"],
  },
};

// ─── Markdown da enem.dev -> HTML (mesma forma dos docs já importados) ───────
function inline(s) {
  return s
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) =>
      `<img src="${url}" alt="${alt}" style="max-width:100%">`)
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,;:!?)]|$)/g, "$1<em>$2</em>");
}
// Alguns enunciados já trazem HTML cru da fonte (às vezes com aspas curvas
// em atributo, que são inválidas). Esses blocos entram como estão, sem o <p>
// externo — senão fica <p><p>…</p></p>.
const BLOCO_HTML = /^<(p|div|table|ul|ol|blockquote|figure|h[1-6])[\s>]/i;
const aspasRetas = (s) => s.replace(/=\s*[\u201c\u201d]([^\u201c\u201d]*)[\u201c\u201d]/g, '="$1"');

function toHtml(context, intro) {
  const blocos = String(context || "")
    .split(/\n{2,}/)
    .map((b) => b.replace(/\s+$/, ""))
    .filter((b) => b.trim().length);
  const ps = blocos.map((b) => {
    const h = inline(b).replace(/\n/g, "<br>");
    return BLOCO_HTML.test(b.trim()) ? aspasRetas(h) : `<p>${h}</p>`;
  });
  if (intro && intro.trim()) ps.push(`<p>${inline(intro.trim())}</p>`);
  return ps.join("");
}

// ─── API ─────────────────────────────────────────────────────────────────────
async function getJson(url, tries = 5) {
  let last;
  for (let t = 1; t <= tries; t++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "vinke-ingles-import/1.0" } });
      if (r.status === 429) { await sleep(t * 10000); continue; }
      if (!r.ok) return { error: `HTTP ${r.status}` };
      return { data: await r.json() };
    } catch (e) { last = e.message; await sleep(t * 3000); }
  }
  return { error: last || "esgotou tentativas" };
}

async function fetchAno(ano) {
  const cacheFile = `${CACHE}/api-${ano}.json`;
  if (existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, "utf8"));
  const qs = [];
  for (let off = 0; off < 200; off += 50) {
    const { data, error } = await getJson(
      `https://api.enem.dev/v1/exams/${ano}/questions?limit=50&offset=${off}&language=ingles`);
    if (error) { if (off === 0) return []; break; }
    qs.push(...data.questions.filter((q) => q.language === "ingles"));
    if (!data.metadata.hasMore) break;
    await sleep(300);
  }
  writeFileSync(cacheFile, JSON.stringify(qs, null, 1));
  return qs;
}

// ─── Monta o doc ─────────────────────────────────────────────────────────────
function montaDoc(q) {
  const agora = new Date();
  const letras = ["A", "B", "C", "D", "E"];
  const options = letras.map((L) => {
    const a = (q.alternatives || []).find((x) => x.letter === L);
    return { id: L, text: a?.file ? "" : (a?.text || ""), imageUrl: a?.file || null, imageWidth: 100 };
  });
  const doc = {
    examId: "enem", examType: "ENEM", prova_tipo: "ENEM",
    examYear: q.year, prova_ano: q.year, enemIndex: q.index,
    reference: `ENEM ${q.year} · Questão ${q.index}`,
    examSource: `(ENEM-${q.year})`, Prova: `(ENEM-${q.year})`,
    enemLanguage: "ingles",
    ...ING,
    classifiedAt: agora, classifiedBy: "importador:ingles-enem.dev",
    prompt: toHtml(q.context, q.alternativesIntroduction),
    prompt_text: toHtml(q.context, q.alternativesIntroduction),
    imageUrl: null, promptImageWidth: 100,
    options,
    correctOptionId: q.correctAlternative,
    explanation: "", explanationFormat: "html",
    explanationSource: null, explainedBy: null,
    isActive: true, status: "ativo", shuffleOptions: false,
    dificuldade: null, internalNote: "", commentAttachments: [],
    importSource: "enem.dev",
    createdAt: agora, updatedAt: agora,
  };
  letras.forEach((L, i) => {
    doc[`option${L}_text`] = options[i].text;
    doc[`option${L}_imageUrl`] = options[i].imageUrl;
  });
  return doc;
}

// ─── Main ────────────────────────────────────────────────────────────────────
const existentes = new Set((await db.collection("questionsBank").select().get()).docs.map((d) => d.id));
console.log(`banco atual: ${existentes.size} questões\n`);

const novos = [];
const problemas = [];
for (let ano = 2010; ano <= 2023; ano++) {
  const qs = await fetchAno(ano);
  const ids = [];
  for (const q of qs) {
    const id = `ENEM${q.year}_Q${String(q.index).padStart(3, "0")}_INGLES`;
    if (existentes.has(id)) { problemas.push(`${id}: JÁ EXISTE, pulado`); continue; }
    const doc = montaDoc(q);
    if (!"ABCDE".includes(doc.correctOptionId)) { problemas.push(`${id}: gabarito inválido (${doc.correctOptionId})`); continue; }
    if (doc.options.some((o) => !o.text && !o.imageUrl)) problemas.push(`${id}: alternativa vazia`);
    if (doc.prompt.length < 80) problemas.push(`${id}: enunciado curto (${doc.prompt.length} chars)`);
    novos.push({ id, doc });
    ids.push(q.index);
  }
  console.log(`${ano}: ${ids.length} novas (índices ${ids.join(",") || "—"})`);
}

console.log(`\nTOTAL a criar: ${novos.length}`);
console.log(`Reclassificar: ${Object.keys(RECLASSIFICAR).length}`);
if (problemas.length) { console.log("\nAVISOS:"); problemas.forEach((p) => console.log("  -", p)); }

writeFileSync(`${CACHE}/novos.json`, JSON.stringify(novos, null, 1));
console.log(`\nprévia salva em ${CACHE}/novos.json`);

if (DRY) { console.log("\n[DRY] nada foi gravado."); process.exit(0); }

let n = 0;
for (let i = 0; i < novos.length; i += 400) {
  const b = db.batch();
  novos.slice(i, i + 400).forEach(({ id, doc }) => b.set(db.doc(`questionsBank/${id}`), doc));
  await b.commit();
  n += Math.min(400, novos.length - i);
  console.log(`  ${n}/${novos.length} gravadas`);
}
const b2 = db.batch();
for (const [id, tax] of Object.entries(RECLASSIFICAR)) {
  b2.set(db.doc(`questionsBank/${id}`),
    { ...tax, classifiedAt: new Date(), classifiedBy: "correcao:vaga-lingua-estrangeira", updatedAt: new Date() },
    { merge: true });
}
await b2.commit();
console.log(`reclassificadas: ${Object.keys(RECLASSIFICAR).length}`);
console.log("\nFIM. Próximo passo: node scripts/img-migrate.mjs");
process.exit(0);
