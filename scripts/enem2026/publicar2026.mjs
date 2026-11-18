// ENEM 2026: valida a saída dos agentes, grava resoluções e (com --ativar) ativa.
// Uso:
//   node publicar2026.mjs                 # só valida e mostra o relatório
//   node publicar2026.mjs --gravar        # grava as resoluções válidas
//   node publicar2026.mjs --ativar        # ativa as que têm resolução + classificação e não estão bloqueadas
// Bloqueio manual: res2026/bloqueadas.json = ["ENEM2026_Q123", ...]
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire("/Users/davidrangel/Projetos/EnemQuest/vinke-admin/package.json");
const { cert, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
for (const line of fs.readFileSync("/Users/davidrangel/Projetos/EnemQuest/.env.local", "utf8").split(/\r?\n/)) {
  const i = line.indexOf("="); if (i < 0) continue;
  let v = line.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  process.env[line.slice(0, i).trim()] ??= v;
}
initializeApp({ credential: cert({ projectId: process.env.FIREBASE_ADMIN_PROJECT_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n") }) });
const db = getFirestore();

const R = new URL("./res2026/", import.meta.url).pathname;
const GRAVAR = process.argv.includes("--gravar");
const ATIVAR = process.argv.includes("--ativar");
const bloqueadas = new Set(fs.existsSync(R + "bloqueadas.json") ? JSON.parse(fs.readFileSync(R + "bloqueadas.json", "utf8")) : []);

const tax = JSON.parse(fs.readFileSync(R + "taxonomia.json", "utf8"));
const discArea = new Map();
for (const [area, v] of Object.entries(tax)) for (const d of v.disciplinas) discArea.set(d.disciplinaId, area);

const CITA_LETRA = /\b(alternativa|letra|op[çc][ãa]o)\s*\(?[A-E]\)?(?![a-zà-ú])|\([A-E]\)|\b(primeira|segunda|terceira|quarta|quinta|última)\s+(alternativa|op[çc][ãa]o)/i;
const TAG_PERMITIDA = /^<\/?(p|strong|em|sub|sup|br)\s*\/?>$/i;

const lotes = fs.readdirSync(R).filter((f) => /^lote\d+-in\.json$/.test(f)).sort();
const ok = [], erros = [], divergencias = [], problemas = [], faltando = [];
for (const f of lotes) {
  const ent = JSON.parse(fs.readFileSync(R + f, "utf8"));
  const fo = R + f.replace("-in", "-out");
  if (!fs.existsSync(fo)) { faltando.push(f); continue; }
  let sai;
  try { sai = JSON.parse(fs.readFileSync(fo, "utf8")); } catch (e) { erros.push(`${fo}: JSON inválido`); continue; }
  if (sai.length !== ent.length) erros.push(`${f}: ${sai.length} itens, esperado ${ent.length}`);
  ent.forEach((q, i) => {
    const r = sai[i];
    if (!r || r.id !== q.id) { erros.push(`${f}[${i}]: id ${r?.id} != ${q.id}`); return; }
    if (discArea.get(r.disciplinaId) !== q.areaId) erros.push(`${q.id}: disciplina ${r.disciplinaId} fora da área`);
    if (r.divergencia) divergencias.push({ id: q.id, gabarito: q.gabarito, sua: r.suaResposta, nota: r.divergencia, temHtml: !!r.html });
    if (r.suaResposta && r.suaResposta !== q.gabarito && !r.divergencia) divergencias.push({ id: q.id, gabarito: q.gabarito, sua: r.suaResposta, nota: "(sem nota)", temHtml: !!r.html });
    if ((r.problemasExtracao || []).length) problemas.push({ id: q.id, itens: r.problemasExtracao });
    // "<" matemático (x < 3) não é tag: escapa o que não for tag permitida
    const html = String(r.html || "").trim().replace(/<(?!\/?(p|strong|em|sub|sup|br)\b)/gi, "&lt;");
    if (!html) return;
    if (!html.startsWith("<p>")) { erros.push(`${q.id}: html não começa com <p>`); return; }
    if (CITA_LETRA.test(html.replace(/<[^>]+>/g, " "))) { erros.push(`${q.id}: cita letra/posição: "${html.replace(/<[^>]+>/g, " ").match(CITA_LETRA)[0]}"`); return; }
    const tags = html.match(/<[^>]+>/g) || [];
    const ruim = tags.find((t) => !TAG_PERMITIDA.test(t));
    if (ruim) { erros.push(`${q.id}: tag não permitida ${ruim}`); return; }
    ok.push({ id: q.id, html });
  });
}

console.log(`lotes: ${lotes.length} · sem saída: ${faltando.join(", ") || "nenhum"}`);
console.log(`resoluções válidas: ${ok.length} · erros: ${erros.length} · divergências: ${divergencias.length} · com problema de extração: ${problemas.length}`);
erros.forEach((e) => console.log("  ERRO", e));
divergencias.forEach((d) => console.log(`  DIVERG ${d.id} oficial=${d.gabarito} agente=${d.sua} html=${d.temHtml ? "sim" : "não"} — ${d.nota}`));
problemas.forEach((p) => console.log(`  EXTRAÇÃO ${p.id}: ${p.itens.join(" | ")}`));
fs.writeFileSync(R + "relatorio.json", JSON.stringify({ ok: ok.map((o) => o.id), erros, divergencias, problemas, faltando }, null, 1));

if (GRAVAR) {
  for (let i = 0; i < ok.length; i += 400) {
    const b = db.batch();
    ok.slice(i, i + 400).forEach(({ id, html }) => b.update(db.doc(`questionsBank/${id}`), {
      explanation: html, explanationFormat: "html", explanationSource: "ia",
      explainedBy: "claude-sonnet:sessao-2026", updatedAt: new Date(),
    }));
    await b.commit();
  }
  console.log(`\nGRAVADAS ${ok.length} resoluções.`);
}

if (ATIVAR) {
  const snap = await db.collection("questionsBank").where("examYear", "==", 2026).get();
  const ativar = [], pulam = [];
  for (const d of snap.docs) {
    const q = d.data();
    if (q.correctOptionId == null) continue; // anulada
    if (bloqueadas.has(d.id)) { pulam.push(`${d.id} (bloqueada)`); continue; }
    if (!String(q.explanation || "").trim() || !q.disciplinaId) { pulam.push(`${d.id} (sem resolução/classificação)`); continue; }
    if (q.isActive === true) continue;
    ativar.push(d.ref);
  }
  for (let i = 0; i < ativar.length; i += 400) {
    const b = db.batch();
    ativar.slice(i, i + 400).forEach((ref) => b.update(ref, { isActive: true, status: "ativo", internalNote: "", updatedAt: new Date() }));
    await b.commit();
  }
  console.log(`\nATIVADAS ${ativar.length}. Ficaram inativas: ${pulam.length}`);
  pulam.forEach((p) => console.log("  -", p));
}
process.exit(0);
