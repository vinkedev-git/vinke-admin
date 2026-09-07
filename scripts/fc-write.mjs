// Valida os fc-out-*.json gerados pelos agentes e grava decks + cards.
// Uso: node scripts/fc-write.mjs [--dry]
//
// Validações por card: schema, tamanhos, themeName ∈ assuntos do insumo,
// termos proibidos (referências a prova/alternativa) e dedupe de fronts.
// Falhas são listadas e o arquivo inteiro é rejeitado (corrigir e rodar
// de novo) — nenhuma escrita parcial por disciplina.

import { readFileSync, existsSync } from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert(
    require("/Users/davidrangel/Projetos/EnemQuest/.secrets/vinke-74695-firebase-adminsdk-fbsvc-374e2db752.json")
  ),
});

const DRY = process.argv.includes("--dry");
const db = admin.firestore();
const DIR = "/private/tmp/claude-501/-Users-davidrangel-Projetos-EnemQuest/098ce75e-0fc4-4db5-92cd-83cca59210d5/scratchpad/fc";

const SLUGS = [
  ["matematica", "Matemática", 1],
  ["portugues", "Língua Portuguesa", 2],
  ["literatura", "Literatura", 3],
  ["linguas", "Línguas Estrangeiras", 4],
  ["artes", "Artes", 5],
  ["edfisica", "Educação Física", 6],
  ["historia", "História", 7],
  ["geografia", "Geografia", 8],
  ["filosofia", "Filosofia", 9],
  ["sociologia", "Sociologia", 10],
  ["biologia", "Biologia", 11],
  ["quimica", "Química", 12],
  ["fisica", "Física", 13],
];

// "letra" só é proibida quando seguida de A-E (referência de alternativa)
const PROIBIDOS = [
  /alternativa/i,
  /\bletra\s+[a-e]\b/i,
  /gabarito/i,
  /assinale/i,
  /enunciado/i,
  /\bquest(ão|ao|ões|oes)\b/i,
];

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const slugify = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function validar(slug, cards, assuntosValidos) {
  const erros = [];
  const fronts = new Set();
  cards.forEach((c, i) => {
    const onde = `${slug}[${i}]`;
    for (const campo of ["front", "back", "themeName", "difficulty"]) {
      if (typeof c[campo] !== "string" || !c[campo].trim()) erros.push(`${onde}: campo ${campo} ausente`);
    }
    if (c.front && c.front.length > 220) erros.push(`${onde}: front longo (${c.front.length})`);
    if (c.back && c.back.length > 520) erros.push(`${onde}: back longo (${c.back.length})`);
    if (c.themeName && !assuntosValidos.has(c.themeName)) erros.push(`${onde}: themeName inválido "${c.themeName}"`);
    if (!["easy", "medium", "hard"].includes(c.difficulty)) erros.push(`${onde}: difficulty "${c.difficulty}"`);
    const texto = `${c.front} ${c.back} ${c.shortExplanation ?? ""}`;
    for (const re of PROIBIDOS) {
      const m = texto.match(re);
      if (m) erros.push(`${onde}: termo proibido "${m[0]}" — front: ${String(c.front).slice(0, 70)}`);
    }
    const nf = norm(c.front);
    if (fronts.has(nf)) erros.push(`${onde}: front duplicado — ${String(c.front).slice(0, 70)}`);
    fronts.add(nf);
  });
  return erros;
}

async function main() {
  const now = new Date();
  let totalCards = 0;
  const porDeck = {};
  const todosErros = [];

  for (const [slug, titulo] of SLUGS) {
    const outPath = `${DIR}/fc-out-${slug}.json`;
    const inPath = `${DIR}/fc-in-${slug}.json`;
    if (!existsSync(outPath)) {
      todosErros.push(`${slug}: fc-out ausente`);
      continue;
    }
    let cards;
    try {
      cards = JSON.parse(readFileSync(outPath, "utf8"));
    } catch (e) {
      todosErros.push(`${slug}: JSON inválido (${e.message.slice(0, 80)})`);
      continue;
    }
    if (!Array.isArray(cards) || cards.length === 0) {
      todosErros.push(`${slug}: array vazio`);
      continue;
    }
    const insumo = JSON.parse(readFileSync(inPath, "utf8"));
    const assuntosValidos = new Set(insumo.assuntos.map((a) => a.nome));
    const erros = validar(slug, cards, assuntosValidos);
    if (erros.length) {
      todosErros.push(...erros);
      continue;
    }
    porDeck[slug] = { titulo, cards };
    totalCards += cards.length;
    console.log(`${slug}: ${cards.length} cards OK`);
  }

  if (todosErros.length) {
    console.log(`\n=== ERROS (${todosErros.length}) ===`);
    todosErros.slice(0, 60).forEach((e) => console.log(" -", e));
    process.exit(2);
  }

  console.log(`\nTotal validado: ${totalCards} cards em ${Object.keys(porDeck).length} decks`);
  if (DRY) return;

  for (const [slug, titulo, ordem] of SLUGS) {
    const pack = porDeck[slug];
    if (!pack) continue;
    const deckId = `deck_enem_${slug}`;

    let batch = db.batch();
    let ops = 0;
    const flush = async () => { await batch.commit(); batch = db.batch(); ops = 0; };

    pack.cards.forEach((c, i) => {
      const cardId = `fc_enem_${slug}_${String(i + 1).padStart(3, "0")}`;
      batch.set(db.collection("flashcards").doc(cardId), {
        frontText: c.front.trim(),
        backText: c.back.trim(),
        shortExplanation: String(c.shortExplanation ?? "").trim(),
        themeId: slugify(c.themeName),
        themeName: c.themeName,
        moduleId: "enem",
        examType: "ENEM",
        examYear: null,
        level: null,
        deckIds: [deckId],
        tags: Array.isArray(c.tags) ? c.tags.slice(0, 3).map((t) => String(t).toLowerCase()) : [],
        difficulty: c.difficulty,
        status: "published",
        isActive: true,
        sourceType: "ai_generated",
        sourceQuestionId: c.sourceQuestionId || null,
        sourceCorrectOptionId: null,
        sourceCorrectOptionText: null,
        sourceReference: null,
        sourceQuestionPreview: null,
        needsReview: false,
        reviewNotes: null,
        createdAt: now,
        updatedAt: now,
        createdBy: "claude-content-ops",
        reviewedBy: null,
        reviewedAt: null,
      });
      ops++;
      if (ops >= 400) flush();
    });
    if (ops) await batch.commit();

    await db.collection("flashcardDecks").doc(deckId).set({
      title: titulo,
      description: `Conceitos de ${titulo} que o ENEM mais cobra, extraídos das provas oficiais.`,
      moduleId: "enem",
      themeId: null,
      cardCount: pack.cards.length,
      isActive: true,
      order: ordem,
      status: "published",
      createdAt: now,
      updatedAt: now,
    });
    console.log(`gravado: ${deckId} (${pack.cards.length} cards)`);
  }
  console.log("FIM");
}

main().catch((e) => { console.error(e); process.exit(1); });
