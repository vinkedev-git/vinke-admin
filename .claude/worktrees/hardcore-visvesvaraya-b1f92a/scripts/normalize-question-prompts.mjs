import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    if (!key || process.env[key]) continue;
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.resolve(process.cwd(), ".env.local"));
loadEnvFile(path.resolve(process.cwd(), ".env"));

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function getArg(flag) {
  const exact = process.argv.find((arg) => arg === flag);
  if (exact) return true;
  const prefix = `${flag}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  return matched ? matched.slice(prefix.length) : null;
}

function normalizeText(value) {
  if (value == null) return "";
  return String(value);
}

function applyEnumeratedLineBreaks(input) {
  let text = input;
  const markerRegex = /(^|\s)(\d{1,2})\s*(?:[-–).])\s+/g;
  const markers = Array.from(text.matchAll(markerRegex));
  if (markers.length < 2) return text;

  // Insere quebra de linha antes de itens numerados colados em uma única frase.
  text = text.replace(/([^\n])\s+(\d{1,2})\s*(?:[-–).])\s+/g, (_, prev, n) => `${prev}\n${n} - `);
  text = text.replace(/(^|\n)\s*(\d{1,2})\s*(?:[-–).])\s+/g, (_, lead, n) => `${lead}${n} - `);
  return text;
}

function normalizePrompt(raw) {
  let text = normalizeText(raw);
  if (!text.trim()) return "";

  text = text.replace(/\r\n?/g, "\n");
  text = text.replace(/\u00a0/g, " ");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n[ \t]+/g, "\n");
  text = text.replace(/[ \t]{2,}/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = applyEnumeratedLineBreaks(text);
  text = text.replace(/\n{3,}/g, "\n\n");

  const lines = text.split("\n").map((line) => line.trimEnd());
  text = lines.join("\n").trim();
  return text;
}

async function main() {
  const apply = Boolean(getArg("--apply"));
  const collectionName = String(getArg("--collection") || "questionsBank").trim();

  const app =
    getApps().length > 0
      ? getApps()[0]
      : initializeApp({
          credential: cert({
            projectId: requiredEnv("FIREBASE_ADMIN_PROJECT_ID"),
            clientEmail: requiredEnv("FIREBASE_ADMIN_CLIENT_EMAIL"),
            privateKey: requiredEnv("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n"),
          }),
        });

  const db = getFirestore(app);
  const snap = await db.collection(collectionName).get();

  const updates = [];
  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const currentPromptText = normalizeText(data.prompt_text || "");
    const currentPrompt = normalizeText(data.prompt || currentPromptText);
    const baseline = currentPromptText || currentPrompt;
    const normalized = normalizePrompt(baseline);
    if (!normalized) continue;

    if (normalized !== currentPromptText || normalized !== currentPrompt) {
      updates.push({
        id: docSnap.id,
        prompt: normalized,
        prompt_text: normalized,
      });
    }
  }

  console.log(`Coleção alvo: ${collectionName}`);
  console.log(`Total lido: ${snap.size}`);
  console.log(`Pendentes para normalizar: ${updates.length}`);
  if (updates.length > 0) {
    console.log("Exemplos:");
    for (const item of updates.slice(0, 5)) {
      console.log(`- ${item.id}: ${item.prompt.slice(0, 140).replace(/\n/g, " | ")}...`);
    }
  }

  if (!apply) {
    console.log("");
    console.log("Dry-run concluído. Para aplicar:");
    console.log(`node scripts/normalize-question-prompts.mjs --apply --collection=${collectionName}`);
    return;
  }

  if (updates.length === 0) {
    console.log("Nada para atualizar.");
    return;
  }

  const chunkSize = 400;
  const commits = [];
  for (let i = 0; i < updates.length; i += chunkSize) {
    const group = updates.slice(i, i + chunkSize);
    const batch = db.batch();
    for (const item of group) {
      batch.update(db.collection(collectionName).doc(item.id), {
        prompt: item.prompt,
        prompt_text: item.prompt_text,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    commits.push(batch.commit());
  }

  await Promise.all(commits);
  console.log(`Atualização concluída. Documentos atualizados: ${updates.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
