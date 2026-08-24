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
  return /<(p|br|ul|ol|li|div|table|blockquote|h[1-6]|pre)\b/i.test(value);
}

function normalizeBaseSpacing(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizePunctuationSpacing(text) {
  let value = text;
  value = value.replace(/\s+([,;:.!?])/g, "$1");
  value = value.replace(/([:;])([A-Za-zÀ-ÿ])/g, "$1 $2");
  value = value.replace(/\(([A-Za-z])\s*,\s*([A-Za-z])\s*,\s*([A-Za-z])\)/g, "($1, $2, $3)");
  value = value.replace(/\(([A-Za-z])\s*,\s*([A-Za-z])\)/g, "($1, $2)");
  value = value.replace(/\(\s+/g, "(");
  value = value.replace(/\s+\)/g, ")");
  value = value.replace(/\[\s+/g, "[");
  value = value.replace(/\s+\]/g, "]");
  return value;
}

function applyEnumeratedLineBreaks(input) {
  let text = input;
  const markerRegex = /(^|\s)(\d{1,2})\s*(?:[-–).])\s+/g;
  const markers = Array.from(text.matchAll(markerRegex));
  if (markers.length < 2) return text;

  text = text.replace(/([^\n])\s+(\d{1,2})\s*(?:[-–).])\s+/g, (_, prev, n) => `${prev}\n${n} - `);
  text = text.replace(/(^|\n)\s*(\d{1,2})\s*(?:[-–).])\s+/g, (_, lead, n) => `${lead}${n} - `);
  return text;
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

function ensureParagraphMarginStyle(html) {
  return html.replace(/<p([^>]*)>/gi, (_full, attrs = "") => {
    const rawAttrs = String(attrs || "");
    const hasStyle = /\bstyle\s*=/i.test(rawAttrs);
    const margin = "margin:0 0 1rem 0;";

    if (!hasStyle) return `<p${rawAttrs} style="${margin}">`;

    const updated = rawAttrs.replace(/\bstyle\s*=\s*(['"])(.*?)\1/i, (_m, quote, styleValue) => {
      const current = String(styleValue || "").trim();
      if (/margin\s*:/i.test(current)) return `style=${quote}${current}${quote}`;
      const sep = current.endsWith(";") || !current ? "" : ";";
      return `style=${quote}${current}${sep}${margin}${quote}`;
    });
    return `<p${updated}>`;
  });
}

function normalizePromptText(value) {
  let text = normalizeBaseSpacing(value);
  if (!text) return "";

  if (hasBlockMarkup(text)) {
    // Mantém HTML do enunciado, só corrige artefatos conhecidos.
    return text
      .replace(/&nbsp;/gi, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  text = normalizePunctuationSpacing(text);
  text = applyEnumeratedLineBreaks(text);
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text;
}

function normalizeExplanation(value) {
  let text = normalizeBaseSpacing(value);
  if (!text) return "";

  if (hasBlockMarkup(text)) {
    const html = text
      .replace(/&nbsp;/gi, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    return ensureParagraphMarginStyle(html);
  }

  text = normalizePunctuationSpacing(text);
  const hinted = text.includes("\n") ? text : splitByLikelySections(text);
  const paragraphs = hinted
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p style="margin:0 0 1rem 0;">${part.replace(/\n/g, "<br />")}</p>`);

  return paragraphs.length ? paragraphs.join("\n") : text;
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

  let promptChanged = 0;
  let explanationChanged = 0;
  const updates = [];
  const samples = [];

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const rawPrompt = String(data.prompt_text ?? data.prompt ?? "");
    const rawExplanation = String(data.explanation ?? "");

    const nextPrompt = normalizePromptText(rawPrompt);
    const nextExplanation = normalizeExplanation(rawExplanation);

    const payload = {};
    let changed = false;

    if (nextPrompt && nextPrompt !== rawPrompt) {
      payload.prompt = nextPrompt;
      payload.prompt_text = nextPrompt;
      changed = true;
      promptChanged += 1;
    }

    if (rawExplanation && nextExplanation && nextExplanation !== rawExplanation) {
      payload.explanation = nextExplanation;
      payload.explanationFormat = "html";
      changed = true;
      explanationChanged += 1;
    }

    if (!changed) continue;

    payload.updatedAt = FieldValue.serverTimestamp();
    updates.push({ id: docSnap.id, payload });

    if (samples.length < 10) {
      samples.push({
        id: docSnap.id,
        promptBefore: rawPrompt.slice(0, 140).replace(/\n/g, "\\n"),
        promptAfter: nextPrompt.slice(0, 140).replace(/\n/g, "\\n"),
        explanationBefore: rawExplanation.slice(0, 140).replace(/\n/g, "\\n"),
        explanationAfter: nextExplanation.slice(0, 140).replace(/\n/g, "\\n"),
      });
    }
  }

  console.log(`Coleção: ${collectionName}`);
  console.log(`Total lido: ${snap.size}`);
  console.log(`Ajustes em enunciado: ${promptChanged}`);
  console.log(`Ajustes em comentário: ${explanationChanged}`);
  console.log(`Documentos a atualizar: ${updates.length}`);

  if (samples.length) {
    console.log("\nAmostras:");
    for (const sample of samples) {
      console.log(`- ${sample.id}`);
      if (sample.promptBefore !== sample.promptAfter) {
        console.log(`  prompt antes: ${sample.promptBefore}`);
        console.log(`  prompt depois: ${sample.promptAfter}`);
      }
      if (sample.explanationBefore !== sample.explanationAfter) {
        console.log(`  comentário antes: ${sample.explanationBefore}`);
        console.log(`  comentário depois: ${sample.explanationAfter}`);
      }
    }
  }

  if (!apply) {
    console.log("\nDry-run concluído.");
    console.log(`Para aplicar: node scripts/review-question-text-quality.mjs --apply --collection=${collectionName}`);
    return;
  }

  if (!updates.length) {
    console.log("Nada para atualizar.");
    return;
  }

  const chunkSize = 400;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const group = updates.slice(i, i + chunkSize);
    const batch = db.batch();
    for (const item of group) {
      batch.update(db.collection(collectionName).doc(item.id), item.payload);
    }
    await batch.commit();
  }

  console.log(`\nAtualização concluída. Documentos atualizados: ${updates.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
