/**
 * Reatribui os temas das questões do TEA 2023 que ficaram sem vínculo com
 * catalog_temas, encaixando-as em temas já existentes no catálogo.
 *
 * Uso:
 *   node scripts/remap-tea2023-themes.mjs           # simulação (dry-run)
 *   node scripts/remap-tea2023-themes.mjs --apply   # grava no Firestore
 */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key]) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.resolve(process.cwd(), ".env.local"));
loadEnvFile(path.resolve(process.cwd(), ".env"));

// docId -> temas do catálogo que passam a valer para a questão
const REMAP = {
  TEA2023_Q001: ["Ética Médica e Bioética. Responsabilidade e risco Profissional do Anestesiologista"],
  TEA2023_Q002: ["Organização da SBA, Cooperativismo e SUS"],
  TEA2023_Q003: ["Ética Médica e Bioética. Responsabilidade e risco Profissional do Anestesiologista"],
  TEA2023_Q004: ["Avaliação e Preparo Pré-Anestésico"],
  TEA2023_Q005: ["Avaliação e Preparo Pré-Anestésico"],
  TEA2023_Q006: ["Vias Aéreas"],
  TEA2023_Q007: ["Vias Aéreas"],
  TEA2023_Q008: ["Posicionamento", "Sistema Nervoso Central e Autônomo"],
  TEA2023_Q015: ["Avaliação e Preparo Pré-Anestésico"],
  TEA2023_Q016: ["Fisiologia e Farmacologia do Sistema Cardiocirculatório"],
  TEA2023_Q017: ["Fisiologia e Farmacologia do Sistema Respiratório"],
  TEA2023_Q018: ["Fisiologia e Farmacologia do Sistema Respiratório"],
  TEA2023_Q019: ["Farmacologia Geral"],
  TEA2023_Q020: ["Farmacologia Geral", "Anestesicos Venosos"],
  TEA2023_Q026: ["Farmacologia dos Anestésicos Locais"],
  TEA2023_Q029: ["Parada Cardíaca e Reanimação", "Vias Aéreas"],
  TEA2023_Q030: ["Parada Cardíaca e Reanimação"],
  TEA2023_Q032: ["Sistema Nervoso Central e Autônomo"],
  TEA2023_Q033: ["Transmissão e Bloqueio Neuromuscular"],
  TEA2023_Q040: ["Anestesia para Procedimentos Fora do Centro Cirúrgico"],
  TEA2023_Q041: ["Bloqueios Periféricos", "Farmacologia dos Anestésicos Locais"],
  TEA2023_Q042: ["Bloqueios Periféricos"],
  TEA2023_Q043: ["Equilíbrio Hidroeletrolítico e Acidobásico"],
  TEA2023_Q044: ["Reposição Volêmica e Transfusão"],
  TEA2023_Q046: ["Fisiologia e Farmacologia do Sistema Urinário"],
  TEA2023_Q049: ["Anestesia em Obstetrícia"],
  TEA2023_Q051: ["Anestesia para Cirurgia Abdominal"],
  TEA2023_Q053: ["Anestesia para Oftalmologia"],
  TEA2023_Q056: ["Anestesia para Cirurgia Torácica", "Bloqueios Subaracnóideo e Peridural"],
  TEA2023_Q057: ["Avaliação e Preparo Pré-Anestésico", "Hemostasia e Anticoagulação"],
  TEA2023_Q060: ["Anestesia em Urgências e no Trauma", "Anestesia para Neurocirurgia"],
  TEA2023_Q061: ["Anestesia e Sistema Endócrino"],
  TEA2023_Q062: ["Bloqueios Periféricos", "Anestesia em Ortopedia"],
  TEA2023_Q063: ["Anestesia Bucomaxilofacial e para Odontologia", "Vias Aéreas"],
  TEA2023_Q064: ["Anestesia para Cirurgia Torácica"],
  TEA2023_Q065: ["Anestesia e Sistema Cardiovascular"],
  TEA2023_Q066: ["Anestesia e Sistema Cardiovascular"],
  TEA2023_Q067: ["Anestesia para Neurocirurgia", "Complicações da Anestesia"],
  TEA2023_Q069: ["Choque", "Anestesia em Urgências e no Trauma"],
  TEA2023_Q071: ["Anestesia para geriatria", "Complicações da Anestesia"],
  TEA2023_Q079: ["Gerenciamento do Centro Cirúrgico"],
};

const apply = process.argv.includes("--apply");

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore();
const temasSnap = await db.collection("catalog_temas").get();
const porTitulo = new Map();
for (const doc of temasSnap.docs) {
  porTitulo.set(String(doc.data().title || "").trim(), doc.id);
}

const titulosInvalidos = new Set();
for (const titulos of Object.values(REMAP)) {
  for (const titulo of titulos) if (!porTitulo.has(titulo)) titulosInvalidos.add(titulo);
}
if (titulosInvalidos.size) {
  console.error("Temas inexistentes no catálogo:", [...titulosInvalidos]);
  process.exit(1);
}

const alteracoes = [];
for (const [docId, titulos] of Object.entries(REMAP)) {
  const ref = db.collection("questionsBank").doc(docId);
  const snap = await ref.get();
  if (!snap.exists) {
    console.warn(`AVISO: ${docId} não encontrado.`);
    continue;
  }
  const antes = snap.data().themes || [];
  alteracoes.push({ ref, docId, antes, depois: titulos, ids: titulos.map((t) => porTitulo.get(t)) });
}

console.log(`Questões a ajustar: ${alteracoes.length}\n`);
for (const item of alteracoes) {
  console.log(`${item.docId}`);
  console.log(`   antes:  ${item.antes.join(" | ") || "(vazio)"}`);
  console.log(`   depois: ${item.depois.join(" | ")}`);
}

if (!apply) {
  console.log("\nSimulação (dry-run). Para gravar:");
  console.log("  node scripts/remap-tea2023-themes.mjs --apply");
  process.exit(0);
}

let batch = db.batch();
let pendentes = 0;
for (const item of alteracoes) {
  batch.update(item.ref, {
    themes: item.depois,
    themeIds: item.ids,
    updatedAt: FieldValue.serverTimestamp(),
  });
  if (++pendentes === 400) {
    await batch.commit();
    batch = db.batch();
    pendentes = 0;
  }
}
if (pendentes) await batch.commit();

console.log(`\nAtualizadas ${alteracoes.length} questões.`);
