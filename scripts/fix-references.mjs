/**
 * Corrige citacoes de capitulo nas referencias das questoes com selo de IA.
 * REGRAS: substituicao literal em todas as questoes.
 * POR_ID: substituicao literal apenas na questao indicada.
 *
 * Uso: node scripts/fix-references.mjs [--apply]
 */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "node:fs"; import path from "node:path";
for (const f of [".env.local", ".env"]) {
  const p = path.resolve(process.cwd(), f); if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i < 0) continue;
    const k = t.slice(0, i).trim(); if (!k || process.env[k]) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
if (!getApps().length) initializeApp({ credential: cert({ projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n") }) });
const db = getFirestore();
const apply = process.argv.includes("--apply");

const REGRAS = [
  // Stoelting: numero errado
  ["cap. 14, Sympathomimetic Drugs", "cap. 18, Sympathomimetic Drugs"],
  // Stoelting: titulos que nao conferem com o sumario
  ["cap. 46, Physiology and Pharmacology of Aging", "cap. 46, Physiology and Pharmacology of the Elderly"],
  ["cap. 9, Nonopioid Analgesics", "cap. 9, Peripherally Acting Analgesics"],
  ["cap. 5, Intravenous Anesthetics", "cap. 5, Intravenous Sedatives and Hypnotics"],
  // Stoelting nao tem capitulos proprios de anticolinergico/anticolinesterasico:
  // a sindrome anticolinergica central e tratada no capitulo de antiemeticos
  ["cap. 15, Anticholinergic Drugs e cap. 16, Anticholinesterase Drugs",
   "cap. 34, Antiemetics (síndrome anticolinérgica central)"],
  // SAESP: titulos reais do sumario
  ["cap. 124, Recuperação Pós-anestésica",
   "cap. 124, Estágios da Recuperação da Anestesia: Aspectos Clínicos e Critérios de Alta"],
  // Guyton: o PDF esta em portugues, padroniza o titulo
  ["cap. 18, Nervous Regulation of the Circulation",
   "cap. 18, Regulação Nervosa da Circulação e Controle Rápido da Pressão Arterial"],
  ["cap. 21, Fluxo Sanguíneo Muscular e Débito Cardíaco durante o Exercício; Circulação Coronariana",
   "cap. 21, Fluxo Sanguíneo Muscular e Débito Cardíaco durante o Exercício e Circulação Coronariana"],
];

const POR_ID = {
  // responsabilidade e organizacao da SRPA ficam no cap. 123, nao no 124
  "333": [["cap. 124, Estágios da Recuperação da Anestesia: Aspectos Clínicos e Critérios de Alta",
           "cap. 123, Organização e Cuidados na Recuperação Pós-anestésica"]],
  // tipos de unidade para procedimentos ambulatoriais estao no cap. 185
  "796": [["cap. 6, Gerenciamento em Anestesiologia", "cap. 185, Anestesia Ambulatorial"]],
};

const snap = await db.collection("questionsBank").where("explanationSource", "==", "ia").get();
const mud = [];
for (const doc of snap.docs) {
  const antes = String(doc.data().reference || "");
  let depois = antes;
  for (const [de, para] of REGRAS) depois = depois.split(de).join(para);
  for (const [de, para] of POR_ID[doc.id] || []) depois = depois.split(de).join(para);
  if (depois !== antes) mud.push({ id: doc.id, antes, depois });
}
console.log(`questoes com selo ia: ${snap.size} | a corrigir: ${mud.length}\n`);
for (const m of mud) console.log(`  ${m.id}\n     de: ${m.antes}\n    para: ${m.depois}\n`);
if (apply) { for (const m of mud) await db.collection("questionsBank").doc(m.id).update({ reference: m.depois });
  console.log(`Corrigidas ${mud.length} referencias.`); }
else console.log("Dry-run. Repita com --apply.");
process.exit(0);
