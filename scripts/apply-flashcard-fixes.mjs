/**
 * Aplica as correções de texto nos flashcards existentes e (opcionalmente) publica.
 *
 * Preserva o docId de cada card, de modo que o histórico de revisão espaçada
 * dos alunos continua válido. Só toca em frontText, backText, shortExplanation
 * e difficulty — nenhum outro campo é alterado.
 *
 * Uso:
 *   node scripts/apply-flashcard-fixes.mjs --file=<correcao.json>              # dry-run
 *   node scripts/apply-flashcard-fixes.mjs --file=<correcao.json> --apply
 *   node scripts/apply-flashcard-fixes.mjs --file=<correcao.json> --apply --publish
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

function getArg(flag) {
  const prefix = `${flag}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

const filePath = getArg("--file");
const apply = process.argv.includes("--apply");
const publish = process.argv.includes("--publish");

if (!filePath || !fs.existsSync(filePath)) {
  console.error("Uso: node scripts/apply-flashcard-fixes.mjs --file=<json> [--apply] [--publish]");
  process.exit(1);
}

const LIM = { frontText: 200, backText: 100, shortExplanation: 300 };
const correcoes = JSON.parse(fs.readFileSync(filePath, "utf8"));

const invalidos = [];
for (const c of correcoes) {
  if (!c.id) invalidos.push("registro sem id");
  for (const [campo, max] of Object.entries(LIM)) {
    const v = String(c[campo] ?? "").trim();
    if (!v) invalidos.push(`${c.id}: ${campo} vazio`);
    else if (v.length > max) invalidos.push(`${c.id}: ${campo} com ${v.length} chars (máx ${max})`);
  }
  if (!["easy", "medium", "hard"].includes(c.difficulty)) {
    invalidos.push(`${c.id}: difficulty inválida (${c.difficulty})`);
  }
}
if (invalidos.length) {
  console.error(`Abortado: ${invalidos.length} registros inválidos.`);
  invalidos.slice(0, 20).forEach((e) => console.error("  -", e));
  process.exit(1);
}

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
const col = db.collection("flashcards");

// Confere que todos os documentos existem antes de escrever
const existentes = new Set((await col.select().get()).docs.map((d) => d.id));
const ausentes = correcoes.filter((c) => !existentes.has(c.id)).map((c) => c.id);
if (ausentes.length) {
  console.error(`Abortado: ${ausentes.length} ids não existem na coleção (evita criar card órfão).`);
  ausentes.slice(0, 10).forEach((i) => console.error("  -", i));
  process.exit(1);
}

console.log(`Correções a aplicar: ${correcoes.length}`);
console.log(`Modo: ${apply ? "GRAVAR" : "DRY-RUN"}${publish ? " + PUBLICAR (status=published, isActive=true)" : ""}`);

if (!apply) {
  console.log("\nDry-run — nada gravado. Rode com --apply para persistir.");
  process.exit(0);
}

let escritos = 0;
for (let i = 0; i < correcoes.length; i += 400) {
  const grupo = correcoes.slice(i, i + 400);
  const batch = db.batch();
  for (const c of grupo) {
    const payload = {
      frontText: String(c.frontText).trim(),
      backText: String(c.backText).trim(),
      shortExplanation: String(c.shortExplanation).trim(),
      difficulty: c.difficulty,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (publish) {
      payload.status = "published";
      payload.isActive = true;
    }
    batch.update(col.doc(c.id), payload);
  }
  await batch.commit();
  escritos += grupo.length;
  console.log(`  → ${escritos}/${correcoes.length}`);
}

console.log(`\nConcluído: ${escritos} flashcards atualizados.`);
