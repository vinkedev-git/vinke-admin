/**
 * Troca o marcador de prova no inicio do enunciado de colchetes para parenteses:
 *   [TEA-2023] Paciente ...  ->  (TEA-2023) Paciente ...
 *
 * Varre todo o questionsBank, atua sobre prompt e prompt_text.
 *
 * Uso:
 *   node scripts/normalize-prompt-tags.mjs           # dry-run
 *   node scripts/normalize-prompt-tags.mjs --apply
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
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n") }) });
const db = getFirestore();
const apply = process.argv.includes("--apply");

// marcador no inicio, tolerando espacos e tags html de abertura antes dele
const TAG = /^(\s*(?:<[^>]+>\s*)*)\[\s*([A-Za-zÀ-ÿ0-9][^\][]{0,40}?)\s*\]/;

function troca(txt) {
  if (typeof txt !== "string") return null;
  const m = txt.match(TAG);
  if (!m) return null;
  return txt.replace(TAG, `$1($2)`);
}

const snap = await db.collection("questionsBank").get();
const mudancas = [];
for (const doc of snap.docs) {
  const d = doc.data();
  const upd = {};
  for (const campo of ["prompt", "prompt_text", "statement", "enunciado"]) {
    const novo = troca(d[campo]);
    if (novo && novo !== d[campo]) upd[campo] = novo;
  }
  if (Object.keys(upd).length) mudancas.push({ id: doc.id, upd, antes: String(d.prompt || d.prompt_text || "").slice(0, 60) });
}

console.log(`documentos no banco: ${snap.size}`);
console.log(`com marcador em colchetes: ${mudancas.length}\n`);
const porTag = {};
for (const m of mudancas) {
  const t = (m.antes.match(/\[([^\]]+)\]/) || [])[1] || "?";
  porTag[t] = (porTag[t] || 0) + 1;
}
for (const [t, n] of Object.entries(porTag).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  [${t}]  ->  (${t})`);

if (apply) {
  let i = 0;
  for (const m of mudancas) { await db.collection("questionsBank").doc(m.id).update(m.upd); i++; }
  console.log(`\nAtualizados ${i} documentos.`);
} else {
  console.log("\nDry-run. Repita com --apply para gravar.");
}
process.exit(0);
