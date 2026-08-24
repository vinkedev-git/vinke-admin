#!/usr/bin/env node
/**
 * Recalcula o campo `cardCount` de cada documento em flashcardDecks,
 * baseado em quantos flashcards realmente referenciam o deck via deckIds.
 *
 * Uso:
 *   node scripts/recalc-deck-counts.mjs [--dry-run] [--delete-empty]
 *
 * Flags:
 *   --dry-run       apenas mostra as diferencas, nao grava
 *   --delete-empty  apaga decks que ficaram com 0 cards
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) { console.error(`Missing env ${name}`); process.exit(1); }
  return v;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const deleteEmpty = process.argv.includes("--delete-empty");

  if (!getApps().length) {
    const projectId = requiredEnv("FIREBASE_ADMIN_PROJECT_ID");
    const clientEmail = requiredEnv("FIREBASE_ADMIN_CLIENT_EMAIL");
    const privateKey = requiredEnv("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n");
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  const db = getFirestore();

  console.log(`[recalc] Modo: ${dryRun ? "DRY-RUN" : "GRAVAR"}${deleteEmpty ? " + APAGAR VAZIOS" : ""}\n`);

  console.log("[1/3] Contando cards por deck...");
  const cardsSnap = await db.collection("flashcards").get();
  const counts = new Map();
  cardsSnap.docs.forEach((doc) => {
    const deckIds = doc.data().deckIds;
    if (!Array.isArray(deckIds)) return;
    deckIds.forEach((deckId) => {
      if (typeof deckId !== "string" || !deckId) return;
      counts.set(deckId, (counts.get(deckId) || 0) + 1);
    });
  });
  console.log(`  Cards totais: ${cardsSnap.size}`);
  console.log(`  Decks referenciados: ${counts.size}`);

  console.log("\n[2/3] Comparando com flashcardDecks...");
  const decksSnap = await db.collection("flashcardDecks").get();
  const toUpdate = [];
  const toDelete = [];
  const unchanged = [];

  decksSnap.docs.forEach((doc) => {
    const oldCount = Number(doc.data().cardCount ?? 0);
    const newCount = counts.get(doc.id) ?? 0;
    if (newCount === 0 && deleteEmpty) {
      toDelete.push({ id: doc.id, title: doc.data().title, oldCount });
    } else if (oldCount !== newCount) {
      toUpdate.push({ id: doc.id, title: doc.data().title, oldCount, newCount });
    } else {
      unchanged.push(doc.id);
    }
  });

  console.log(`  Sem mudanca: ${unchanged.length}`);
  console.log(`  Para atualizar cardCount: ${toUpdate.length}`);
  console.log(`  Para apagar (vazios): ${toDelete.length}`);

  if (toUpdate.length > 0) {
    console.log("\n  Exemplos de atualizacao (top 10 com maior diferenca):");
    toUpdate
      .map((t) => ({ ...t, diff: Math.abs(t.oldCount - t.newCount) }))
      .sort((a, b) => b.diff - a.diff)
      .slice(0, 10)
      .forEach((t) => {
        console.log(`    ${t.oldCount.toString().padStart(4)} → ${t.newCount.toString().padStart(4)}  ${t.title}`);
      });
  }

  if (toDelete.length > 0) {
    console.log("\n  Decks vazios que seriam apagados:");
    toDelete.slice(0, 20).forEach((d) => {
      console.log(`    [${d.id}] antes ${d.oldCount} → agora 0  ${d.title}`);
    });
    if (toDelete.length > 20) console.log(`    ... e mais ${toDelete.length - 20}`);
  }

  if (dryRun) {
    console.log("\n[dry-run] Nada foi gravado.");
    return;
  }

  console.log("\n[3/3] Aplicando mudancas...");
  const CHUNK = 400;
  const now = new Date();

  for (let i = 0; i < toUpdate.length; i += CHUNK) {
    const chunk = toUpdate.slice(i, i + CHUNK);
    const batch = db.batch();
    chunk.forEach((t) => {
      batch.set(
        db.collection("flashcardDecks").doc(t.id),
        { cardCount: t.newCount, updatedAt: now },
        { merge: true }
      );
    });
    await batch.commit();
    console.log(`  Atualizados: ${Math.min(i + CHUNK, toUpdate.length)}/${toUpdate.length}`);
  }

  if (deleteEmpty && toDelete.length > 0) {
    for (let i = 0; i < toDelete.length; i += CHUNK) {
      const chunk = toDelete.slice(i, i + CHUNK);
      const batch = db.batch();
      chunk.forEach((d) => batch.delete(db.collection("flashcardDecks").doc(d.id)));
      await batch.commit();
      console.log(`  Apagados: ${Math.min(i + CHUNK, toDelete.length)}/${toDelete.length}`);
    }
  }

  console.log("\n✅ Concluido!");
}

main().catch((err) => {
  console.error("[recalc] Falha:", err);
  process.exit(1);
});
