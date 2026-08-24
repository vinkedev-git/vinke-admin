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
      (value.startsWith('"') && value.endsWith('"')) ||
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

function hasBlockMarkup(value) {
  return /<(p|br|ul|ol|li|div|table|blockquote|h[1-6])\b/i.test(value);
}

const PARAGRAPH_MARGIN = "margin:0 0 1rem 0;";

function ensureParagraphMarginStyle(html) {
  return html.replace(/<p([^>]*)>/gi, (_full, attrs = "") => {
    const rawAttrs = String(attrs || "");
    const hasStyle = /\bstyle\s*=/i.test(rawAttrs);

    if (!hasStyle) {
      return `<p${rawAttrs} style="${PARAGRAPH_MARGIN}">`;
    }

    const updated = rawAttrs.replace(
      /\bstyle\s*=\s*(['"])(.*?)\1/i,
      (_m, quote, styleValue) => {
        const current = String(styleValue || "").trim();
        if (/margin\s*:/i.test(current)) {
          return `style=${quote}${current}${quote}`;
        }
        const sep = current.endsWith(";") || !current ? "" : ";";
        return `style=${quote}${current}${sep}${PARAGRAPH_MARGIN}${quote}`;
      }
    );
    return `<p${updated}>`;
  });
}

function normalizeSpacing(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitByLikelySections(text) {
  return text
    .replace(/\s+(?=Por que [^?]{3,}\?)/g, "\n\n")
    .replace(/\s+(?=Porque [^?]{3,}\?)/g, "\n\n")
    .replace(/\s+(?=(?:Vantagem|Desvantagem|Conclusão|Resumo|Componentes?|Estratificação)\b)/g, "\n\n")
    .replace(/ (?=[A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][^:\n]{5,90}: )/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeExplanationParagraphs(value) {
  if (!value || typeof value !== "string") return "";

  const raw = normalizeSpacing(value);
  if (!raw) return "";
  if (hasBlockMarkup(raw)) return ensureParagraphMarginStyle(raw);

  const withHints = raw.includes("\n") ? raw : splitByLikelySections(raw);
  const paragraphs = withHints
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p style="${PARAGRAPH_MARGIN}">${part.replace(/\n/g, "<br />")}</p>`);

  if (!paragraphs.length) return raw;
  return paragraphs.join("\n");
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

    const normalized = normalizeExplanationParagraphs(explanation);
    if (normalized !== explanation) {
      changed += 1;
      pending.push({
        id: docSnap.id,
        payload: {
          explanation: normalized,
          explanationFormat: "html",
          updatedAt: FieldValue.serverTimestamp(),
        },
      });

      if (samples.length < 8) {
        samples.push({
          id: docSnap.id,
          before: explanation.slice(0, 180).replace(/\n/g, "\\n"),
          after: normalized.slice(0, 180).replace(/\n/g, "\\n"),
        });
      }
    }
  }

  console.log(`Coleção alvo: ${collectionName}`);
  console.log(`Total lido: ${snap.size}`);
  console.log(`Com comentário: ${withExplanation}`);
  console.log(`Com ajuste de parágrafo: ${changed}`);

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
      `node scripts/normalize-explanations-paragraphs.mjs --apply --collection=${collectionName}`
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
