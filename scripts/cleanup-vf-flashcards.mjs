#!/usr/bin/env node
/**
 * Detecta e remove flashcards que sao originalmente questoes de V/F,
 * assertivas ou "somente X esta correta" — que nao ficam bons como flashcards.
 *
 * Uso:
 *   node scripts/cleanup-vf-flashcards.mjs [--dry-run] [--sample=N]
 *
 * Flags:
 *   --dry-run    apenas identifica, nao apaga (default: apaga)
 *   --sample=N   printa N exemplos aleatorios dos detectados
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
  const v = process.env[name];
  if (!v) { console.error(`Missing env ${name}`); process.exit(1); }
  return v;
}

function getArg(flag) {
  const p = `${flag}=`;
  const raw = process.argv.find((a) => a.startsWith(p));
  return raw ? raw.slice(p.length) : null;
}

// ─── Deteccao ─────────────────────────────────────────────────────────────────

/**
 * Retorna a razao pela qual o card eh considerado "ruim" (V/F ou similar),
 * ou null se nao for.
 */
function detectBadCard(data) {
  const front = String(data.frontText ?? "").trim();
  const back = String(data.backText ?? "").trim();
  const preview = String(data.sourceQuestionPreview ?? "").trim();
  const correctText = String(data.sourceCorrectOptionText ?? "").trim();

  // 1. Verso com padrao V/F: "V", "V, F", "V, V, V, F" etc.
  //    Ate 6 letras V/F separadas por virgula/espaco
  if (/^[VF]([\s,]+[VF]){0,5}$/i.test(back)) {
    return `verso V/F: "${back}"`;
  }

  // 2. Verso comeca com "Itens corretos:" (padrao de multipla assertiva)
  if (/^itens corretos\s*:/i.test(back)) {
    return `verso "Itens corretos:"`;
  }

  // 3. Verso ou correctText com "Somente X está correta/corretas"
  if (/^somente\s+[\d\s,eE]+\s+(esta|é|sao|estao)\s+correta/i.test(back)) {
    return `verso "Somente X correta"`;
  }
  if (/^somente\s+[\d\s,eE]+\s+(esta|é|sao|estao)\s+correta/i.test(correctText)) {
    return `correctText "Somente X correta"`;
  }

  // 4. correctText numerico tipo "SOMENTE 1, 2 E 3 SÃO CORRETAS"
  if (/^(SE\s+)?SOMENTE\s+\d+(\s*,\s*\d+)*(\s+E\s+\d+)?\s+(É|SÃO)/i.test(correctText)) {
    return `correctText enumeracao "${correctText.slice(0, 50)}"`;
  }

  // 5. Frente pergunta sobre afirmacoes/itens/assertivas
  if (/quais\s+(afirmac|assertiv|itens)/i.test(front)) {
    return `frente sobre "quais afirmacoes/assertivas/itens"`;
  }
  if (/assertivas?\s+(estao|são|é|sao)/i.test(front)) {
    return `frente com assertivas`;
  }

  // 6. Preview original com "I- ... II- ... III-" (padrao V/F multipla)
  if (/\bI[-.]?\s.+?\bII[-.]?\s.+?\bIII[-.]?/is.test(preview)) {
    return `preview com I/II/III (V/F ou assertiva multipla)`;
  }

  // 7. Frente ou preview com "Considere as (afirmac|assertiv)"
  if (/considere\s+(as|os)\s+(afirmac|assertiv|item)/i.test(front) ||
      /considere\s+(as|os)\s+(afirmac|assertiv|item)/i.test(preview)) {
    return `enunciado "Considere as afirmacoes/assertivas"`;
  }

  // 8. Verso muito curto (1-2 chars) — provavelmente so letra "B" ou algo trivial
  if (back.length <= 2) {
    return `verso trivial (${back.length} char): "${back}"`;
  }

  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const sampleN = Number.parseInt(getArg("--sample") ?? "10", 10) || 10;

  if (!getApps().length) {
    const projectId = requiredEnv("FIREBASE_ADMIN_PROJECT_ID");
    const clientEmail = requiredEnv("FIREBASE_ADMIN_CLIENT_EMAIL");
    const privateKey = requiredEnv("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n");
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  const db = getFirestore();

  console.log(`[cleanup-vf] Modo: ${dryRun ? "DRY-RUN (nao apaga)" : "APAGAR"}\n`);
  console.log("[1/3] Lendo colecao flashcards...");
  const snap = await db.collection("flashcards").get();
  console.log(`  Total no banco: ${snap.size}`);

  console.log("\n[2/3] Detectando cards ruins...");
  const badByReason = new Map();
  const bad = [];
  snap.docs.forEach((doc) => {
    const data = doc.data();
    const reason = detectBadCard(data);
    if (reason) {
      const short = reason.split(":")[0].split("(")[0].trim();
      badByReason.set(short, (badByReason.get(short) || 0) + 1);
      bad.push({ id: doc.id, reason, front: String(data.frontText ?? "").slice(0, 80), back: String(data.backText ?? "").slice(0, 60) });
    }
  });

  console.log(`  Total detectado: ${bad.length} (${((bad.length / snap.size) * 100).toFixed(1)}%)`);
  console.log(`  Por padrao:`);
  Array.from(badByReason.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([reason, count]) => {
      console.log(`    - ${count.toString().padStart(4)}: ${reason}`);
    });

  console.log(`\n  Amostra de ${Math.min(sampleN, bad.length)} exemplos:`);
  // Escolhe amostras espalhadas (nao usa Math.random pra ser deterministico)
  const step = Math.max(1, Math.floor(bad.length / sampleN));
  for (let i = 0; i < Math.min(sampleN, bad.length); i += 1) {
    const item = bad[i * step] ?? bad[i];
    if (!item) break;
    console.log(`    [${item.id}] ${item.reason}`);
    console.log(`      Q: ${item.front}...`);
    console.log(`      R: ${item.back}`);
  }

  if (dryRun) {
    console.log("\n[dry-run] Nada foi apagado. Rode sem --dry-run para apagar.");
    return;
  }

  if (bad.length === 0) {
    console.log("\nNada a apagar.");
    return;
  }

  console.log(`\n[3/3] Apagando ${bad.length} cards...`);
  const CHUNK = 400;
  let done = 0;
  for (let i = 0; i < bad.length; i += CHUNK) {
    const chunk = bad.slice(i, i + CHUNK);
    const batch = db.batch();
    chunk.forEach((item) => batch.delete(db.collection("flashcards").doc(item.id)));
    await batch.commit();
    done += chunk.length;
    console.log(`  → ${done}/${bad.length}`);
  }

  console.log(`\n✅ Concluido: ${bad.length} cards apagados.`);
}

main().catch((err) => {
  console.error("[cleanup-vf] Falha:", err);
  process.exit(1);
});
