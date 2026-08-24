/**
 * Grava comentários (explanation) e referências (reference) em questões do
 * questionsBank a partir dos arquivos com_*.json produzidos na revisão.
 *
 * Confere o gabarito de cada arquivo contra o do banco antes de gravar e
 * ABORTA se houver divergência, para nunca publicar comentário que contradiz
 * o gabarito.
 *
 * Uso:
 *   node scripts/apply-question-comments.mjs --dir=<pasta>            # dry-run
 *   node scripts/apply-question-comments.mjs --dir=<pasta> --apply
 */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
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

function getArg(flag) {
  if (process.argv.includes(flag)) return true;
  const m = process.argv.find((a) => a.startsWith(`${flag}=`));
  return m ? m.slice(flag.length + 1) : null;
}

const apply = Boolean(getArg("--apply"));
const dir = getArg("--dir");
if (!dir) throw new Error("Informe --dir=<pasta com os com_*.json>");

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

const arquivos = fs.readdirSync(dir).filter((f) => /^com_.*\.json$/.test(f)).sort();
const itens = arquivos.flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));

// regras de estilo que o lote precisa respeitar
const PROIBIDO = [[/—/g, "travessao"], [/(?<!<)--/g, "hifen duplo"], [/__/g, "underscore"], [/–/g, "meia-risca"]];

console.log(`arquivos: ${arquivos.length} | comentarios: ${itens.length}`);
console.log(`modo: ${apply ? "APLICAR" : "dry-run"}\n`);

const erros = [];
const prontos = [];
for (const it of itens) {
  const snap = await db.collection("questionsBank").doc(it.id).get();
  if (!snap.exists) { erros.push(`${it.id}: documento inexistente`); continue; }
  const x = snap.data();

  if (String(x.correctOptionId) !== String(it.gab)) {
    erros.push(`${it.id}: GABARITO DIVERGE (banco=${x.correctOptionId}, arquivo=${it.gab})`);
    continue;
  }
  for (const [re, nome] of PROIBIDO) {
    const n = (it.explanation.match(re) || []).length;
    if (n) erros.push(`${it.id}: ${n}x ${nome} no texto`);
  }
  if (!/<p style="margin:0 0 1rem 0;">/.test(it.explanation)) erros.push(`${it.id}: sem o estilo de paragrafo padrao`);
  if (!it.reference) erros.push(`${it.id}: sem reference`);

  const atual = String(x.explanation || "").replace(/<[^>]*>/g, "").trim();
  prontos.push({ id: it.id, it, tinha: /em breve/i.test(atual) ? "placeholder" : atual ? `texto (${atual.length} ch)` : "vazio" });
}

if (erros.length) {
  console.log("ERROS ENCONTRADOS, nada sera gravado:");
  erros.forEach((e) => console.log("  " + e));
  process.exit(1);
}

for (const p of prontos) {
  console.log(`  ${p.id}: ${p.tinha} -> comentario novo (${p.it.explanation.length} ch)`);
  if (apply) {
    await db.collection("questionsBank").doc(p.id).update({
      explanation: p.it.explanation,
      reference: p.it.reference,
      explanationFormat: "html",
      explanationSource: "ia",
    });
  }
}

console.log(`\n${apply ? `Gravados ${prontos.length} comentarios.` : "Dry-run. Repita com --apply para gravar."}`);
process.exit(0);
