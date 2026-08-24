#!/usr/bin/env node
/**
 * Importa os flashcards (aba Flashcards_Import) e decks (aba Decks_Import) para o Firestore.
 *
 * Uso:
 *   node scripts/import-flashcards.mjs \
 *     --file="/caminho/para/anestesia_flashcards_import_2026-06-26.xlsx" \
 *     [--dry-run]
 *
 * Requer as mesmas variaveis de ambiente do sync-questions-from-xlsx.mjs
 * (FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY).
 */

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

// ─── Boot ─────────────────────────────────────────────────────────────────────

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

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[import-flashcards] Variavel de ambiente ausente: ${name}`);
    process.exit(1);
  }
  return value;
}

function getArg(flag) {
  const prefix = `${flag}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : null;
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function pickString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function parseBool(value, defaultValue = false) {
  if (value === true || value === false) return value;
  const normalized = pickString(value).toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "sim") return true;
  if (normalized === "false" || normalized === "0" || normalized === "nao") return false;
  return defaultValue;
}

function parseNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = pickString(value);
  if (!raw) return null;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseList(value) {
  const raw = pickString(value);
  if (!raw) return [];
  return raw
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

function chunk(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

// ─── Leitura da planilha ──────────────────────────────────────────────────────

function readSheet(filePath, sheetName) {
  const workbook = xlsx.readFile(filePath, { cellDates: true });
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    console.error(`[import-flashcards] Aba nao encontrada: ${sheetName}`);
    process.exit(1);
  }
  return xlsx.utils.sheet_to_json(sheet, { defval: null });
}

// ─── Normalizacao ─────────────────────────────────────────────────────────────

const VALID_STATUS = new Set(["pending_review", "published", "draft", "archived"]);
const VALID_DIFFICULTY = new Set(["easy", "medium", "hard"]);
const VALID_SOURCE_TYPE = new Set(["question", "manual", "ai_generated"]);
const VALID_MODULE = new Set(["me", "tea", "tsa"]);

function normalizeFlashcardRow(row, index) {
  const errors = [];
  const flashcardId = pickString(row.flashcardId);
  if (!flashcardId) errors.push(`linha ${index + 2}: flashcardId vazio`);

  const frontText = pickString(row.frontText);
  if (!frontText) errors.push(`${flashcardId || `linha ${index + 2}`}: frontText vazio`);

  const backText = pickString(row.backText);
  if (!backText) errors.push(`${flashcardId || `linha ${index + 2}`}: backText vazio`);

  const moduleId = pickString(row.moduleId).toLowerCase();
  if (moduleId && !VALID_MODULE.has(moduleId)) {
    errors.push(`${flashcardId}: moduleId invalido "${moduleId}" (esperado me|tea|tsa)`);
  }

  const status = pickString(row.status) || "pending_review";
  if (!VALID_STATUS.has(status)) errors.push(`${flashcardId}: status invalido "${status}"`);

  const difficulty = pickString(row.difficulty) || "medium";
  if (!VALID_DIFFICULTY.has(difficulty)) errors.push(`${flashcardId}: difficulty invalido "${difficulty}"`);

  const sourceType = pickString(row.sourceType) || "question";
  if (!VALID_SOURCE_TYPE.has(sourceType)) errors.push(`${flashcardId}: sourceType invalido "${sourceType}"`);

  if (errors.length) return { errors, doc: null, id: flashcardId };

  const doc = {
    frontText,
    backText,
    shortExplanation: pickString(row.shortExplanation),
    themeId: pickString(row.themeId),
    themeName: pickString(row.themeName),
    moduleId: moduleId || null,
    examType: pickString(row.examType).toUpperCase() || null,
    examYear: parseNumber(row.examYear),
    level: pickString(row.level) || null,
    deckIds: parseList(row.deckIds),
    tags: parseList(row.tags),
    difficulty,
    status,
    isActive: parseBool(row.isActive, false),
    sourceType,
    sourceQuestionId: pickString(row.sourceQuestionId) || null,
    sourceCorrectOptionId: pickString(row.sourceCorrectOptionId) || null,
    sourceCorrectOptionText: pickString(row.sourceCorrectOptionText) || null,
    sourceReference: pickString(row.sourceReference) || null,
    sourceQuestionPreview: pickString(row.sourceQuestionPreview) || null,
    needsReview: parseBool(row.needsReview, true),
    reviewNotes: pickString(row.reviewNotes) || null,
    createdBy: null,
    reviewedBy: null,
    reviewedAt: null,
  };

  return { errors: [], doc, id: flashcardId };
}

function normalizeDeckRow(row, index) {
  const errors = [];
  const deckId = pickString(row.deckId);
  if (!deckId) errors.push(`linha ${index + 2}: deckId vazio`);

  const title = pickString(row.title);
  if (!title) errors.push(`${deckId || `linha ${index + 2}`}: title vazio`);

  const status = pickString(row.status) || "pending_review";
  if (!VALID_STATUS.has(status)) errors.push(`${deckId}: status invalido "${status}"`);

  const moduleRaw = pickString(row.moduleId).toLowerCase();
  const moduleId = moduleRaw && VALID_MODULE.has(moduleRaw) ? moduleRaw : null;

  if (errors.length) return { errors, doc: null, id: deckId };

  const doc = {
    title,
    description: pickString(row.description),
    moduleId,
    themeId: pickString(row.themeId) || null,
    cardCount: parseNumber(row.cardCount) ?? 0,
    isActive: parseBool(row.isActive, false),
    order: parseNumber(row.order) ?? 0,
    status,
  };

  return { errors: [], doc, id: deckId };
}

// ─── Firestore ────────────────────────────────────────────────────────────────

function initFirebase() {
  if (getApps().length > 0) return;
  const projectId = requiredEnv("FIREBASE_ADMIN_PROJECT_ID");
  const clientEmail = requiredEnv("FIREBASE_ADMIN_CLIENT_EMAIL");
  const privateKey = requiredEnv("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n");
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

async function upsertDocs(db, collectionName, entries, dryRun) {
  if (!entries.length) return { written: 0 };
  if (dryRun) {
    console.log(`[dry-run] ${collectionName}: ${entries.length} documentos seriam gravados`);
    return { written: 0 };
  }

  const now = FieldValue.serverTimestamp();
  const CHUNK_SIZE = 400; // Firestore batch limit = 500 writes
  let written = 0;

  for (const batchEntries of chunk(entries, CHUNK_SIZE)) {
    const batch = db.batch();
    for (const { id, doc } of batchEntries) {
      const ref = db.collection(collectionName).doc(id);
      const snap = await ref.get();
      const payload = {
        ...doc,
        updatedAt: now,
      };
      if (!snap.exists) {
        payload.createdAt = now;
      }
      batch.set(ref, payload, { merge: true });
    }
    await batch.commit();
    written += batchEntries.length;
    console.log(`  → ${collectionName}: ${written}/${entries.length}`);
  }

  return { written };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const filePath = getArg("--file");
  if (!filePath || !fs.existsSync(filePath)) {
    console.error("Uso: node scripts/import-flashcards.mjs --file=<caminho.xlsx> [--dry-run]");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run");
  console.log(`[import-flashcards] Arquivo: ${filePath}`);
  console.log(`[import-flashcards] Modo: ${dryRun ? "DRY-RUN (nao grava)" : "GRAVAR NO FIRESTORE"}`);

  // Le abas
  console.log("\n[1/4] Lendo abas da planilha...");
  const flashcardRows = readSheet(filePath, "Flashcards_Import");
  const deckRows = readSheet(filePath, "Decks_Import");
  console.log(`  Flashcards_Import: ${flashcardRows.length} linhas`);
  console.log(`  Decks_Import: ${deckRows.length} linhas`);

  // Normaliza
  console.log("\n[2/4] Validando e normalizando...");
  const validFlashcards = [];
  const flashcardErrors = [];
  flashcardRows.forEach((row, i) => {
    const { errors, doc, id } = normalizeFlashcardRow(row, i);
    if (errors.length) flashcardErrors.push(...errors);
    else validFlashcards.push({ id, doc });
  });

  const validDecks = [];
  const deckErrors = [];
  deckRows.forEach((row, i) => {
    const { errors, doc, id } = normalizeDeckRow(row, i);
    if (errors.length) deckErrors.push(...errors);
    else validDecks.push({ id, doc });
  });

  if (flashcardErrors.length) {
    console.error(`\n[erro] ${flashcardErrors.length} problemas em flashcards:`);
    flashcardErrors.slice(0, 20).forEach((e) => console.error(`  - ${e}`));
    if (flashcardErrors.length > 20) console.error(`  ... e mais ${flashcardErrors.length - 20}`);
  }
  if (deckErrors.length) {
    console.error(`\n[erro] ${deckErrors.length} problemas em decks:`);
    deckErrors.slice(0, 20).forEach((e) => console.error(`  - ${e}`));
  }
  if (flashcardErrors.length || deckErrors.length) {
    console.error("\nCorrija os problemas acima antes de importar. Abortando.");
    process.exit(1);
  }

  console.log(`  ${validFlashcards.length} flashcards validos`);
  console.log(`  ${validDecks.length} decks validos`);

  // Firestore
  initFirebase();
  const db = getFirestore();

  console.log("\n[3/4] Gravando decks...");
  await upsertDocs(db, "flashcardDecks", validDecks, dryRun);

  console.log("\n[4/4] Gravando flashcards...");
  await upsertDocs(db, "flashcards", validFlashcards, dryRun);

  console.log("\n✅ Importacao concluida!");
  if (dryRun) {
    console.log("(dry-run — nada foi gravado. Rode sem --dry-run para persistir.)");
  }
}

main().catch((error) => {
  console.error("[import-flashcards] Falha:", error);
  process.exit(1);
});
