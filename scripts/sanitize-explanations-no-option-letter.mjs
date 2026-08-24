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

function sanitizeExplanation(text) {
  if (!text || typeof text !== "string") return "";

  let next = text;

  // "C) texto..." -> "texto..." (início de linha)
  next = next.replace(/(^|<br\s*\/?>|\n)\s*[A-E]\)\s+/gi, "$1");
  // "<p><strong>C) texto..." -> "<p><strong>texto..."
  next = next.replace(
    /((?:<(?:p|li|strong|em|b|u)[^>]*>\s*)+)([A-E])\)\s+/gi,
    "$1"
  );

  // "Alternativa C: ..." -> "Esta alternativa: ..."
  next = next.replace(/\bAlternativa\s+[A-E]\s*:/gi, "Esta alternativa:");
  next = next.replace(/\bAlternativa\s+[A-E]\b/gi, "Esta alternativa");

  // "A alternativa C é..." -> "Esta alternativa é..."
  next = next.replace(/\b[Aa]\s+alternativa\s+[A-E]\b/g, "Esta alternativa");

  // "por que a alternativa C é a correta?" -> forma neutra
  next = next.replace(
    /\b[Pp]or que\s+a\s+alternativa\s+[A-E]\s+é\s+a\s+correta\?/gi,
    "Por que esta é a alternativa correta?"
  );

  // "a letra C" -> "a alternativa correta"
  next = next.replace(/\ba\s+letra\s+[A-E]\b/gi, "a alternativa correta");
  next = next.replace(/\bletra\s+[A-E]\b/gi, "alternativa correta");

  // Ajustes gramaticais após substituições
  next = next.replace(/\ba\s+Esta alternativa\b/g, "esta alternativa");
  next = next.replace(/\ba\s+esta alternativa\b/g, "esta alternativa");
  next = next.replace(
    /\b[Pp]or que\s+esta alternativa\s+é\s+a\s+correta\?/g,
    "Por que esta é a alternativa correta?"
  );

  // Limpa espaços redundantes sem mexer muito em HTML
  next = next.replace(/[ \t]{2,}/g, " ");

  return next.trim();
}

async function main() {
  const apply = Boolean(getArg("--apply"));
  const collectionName = String(getArg("--collection") || "questionsBank").trim() || "questionsBank";

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

  let withExplanation = 0;
  let changed = 0;
  const pending = [];
  const samples = [];

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const explanation = typeof data.explanation === "string" ? data.explanation : "";
    if (!explanation.trim()) continue;
    withExplanation += 1;

    const sanitized = sanitizeExplanation(explanation);
    if (sanitized !== explanation) {
      changed += 1;
      pending.push({
        id: docSnap.id,
        payload: {
          explanation: sanitized,
          updatedAt: FieldValue.serverTimestamp(),
        },
      });

      if (samples.length < 8) {
        samples.push({
          id: docSnap.id,
          before: explanation.slice(0, 160),
          after: sanitized.slice(0, 160),
        });
      }
    }
  }

  console.log(`Coleção alvo: ${collectionName}`);
  console.log(`Total lido: ${snap.size}`);
  console.log(`Com comentário: ${withExplanation}`);
  console.log(`Com referência fixa de letra: ${changed}`);

  if (samples.length) {
    console.log("");
    console.log("Amostras:");
    for (const sample of samples) {
      console.log(`- ${sample.id}`);
      console.log(`  antes: ${sample.before}`);
      console.log(`  depois: ${sample.after}`);
    }
  }

  if (!apply) {
    console.log("");
    console.log("Dry-run concluído. Para aplicar:");
    console.log(
      `node scripts/sanitize-explanations-no-option-letter.mjs --apply --collection=${collectionName}`
    );
    return;
  }

  if (!pending.length) {
    console.log("Nada para atualizar.");
    return;
  }

  const chunkSize = 400;
  for (let i = 0; i < pending.length; i += chunkSize) {
    const group = pending.slice(i, i + chunkSize);
    const batch = db.batch();
    for (const item of group) {
      batch.update(db.collection(collectionName).doc(item.id), item.payload);
    }
    await batch.commit();
  }

  console.log(`Atualização concluída. Documentos atualizados: ${pending.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
