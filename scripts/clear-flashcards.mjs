#!/usr/bin/env node
/**
 * Apaga todos os documentos das colecoes flashcards e flashcardDecks.
 *
 * Uso:
 *   node scripts/clear-flashcards.mjs [--dry-run] [--include-progress]
 *
 * Flags:
 *   --dry-run          apenas conta, nao deleta
 *   --include-progress tambem apaga userFlashcardProgress (progresso dos alunos)
 */

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
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

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[clear-flashcards] Variavel ausente: ${name}`);
    process.exit(1);
  }
  return value;
}

async function deleteCollection(db, collectionName, dryRun) {
  const CHUNK_SIZE = 400;
  let deleted = 0;

  while (true) {
    const snap = await db.collection(collectionName).limit(CHUNK_SIZE).get();
    if (snap.empty) break;

    if (dryRun) {
      deleted += snap.size;
      console.log(`  [dry-run] ${collectionName}: ${deleted} documento(s) seriam apagados`);
      // Sai do loop pra nao contar infinitamente em dry-run
      const total = (await db.collection(collectionName).count().get()).data().count;
      console.log(`  Total real na colecao: ${total}`);
      return { deleted: total };
    }

    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snap.size;
    console.log(`  → ${collectionName}: ${deleted} apagados...`);
    if (snap.size < CHUNK_SIZE) break;
  }

  return { deleted };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const includeProgress = process.argv.includes("--include-progress");

  const projectId = requiredEnv("FIREBASE_ADMIN_PROJECT_ID");
  const clientEmail = requiredEnv("FIREBASE_ADMIN_CLIENT_EMAIL");
  const privateKey = requiredEnv("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n");

  if (!getApps().length) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  const db = getFirestore();

  console.log(`[clear-flashcards] Modo: ${dryRun ? "DRY-RUN" : "APAGAR"}`);
  console.log(`[clear-flashcards] Projeto: ${projectId}\n`);

  console.log("[1] Apagando flashcards...");
  await deleteCollection(db, "flashcards", dryRun);

  console.log("\n[2] Apagando flashcardDecks...");
  await deleteCollection(db, "flashcardDecks", dryRun);

  if (includeProgress) {
    console.log("\n[3] Apagando userFlashcardProgress...");
    await deleteCollection(db, "userFlashcardProgress", dryRun);
  } else {
    console.log("\n[3] Pulando userFlashcardProgress (use --include-progress para apagar tambem)");
  }

  console.log("\n✅ Concluido!");
  if (dryRun) console.log("(dry-run — nada foi apagado)");
}

main().catch((err) => {
  console.error("[clear-flashcards] Falha:", err);
  process.exit(1);
});
