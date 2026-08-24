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
  return String(value).trim();
}

function parseYearFromPrompt(prompt) {
  const text = normalizeText(prompt);
  if (!text) return null;

  const patterns = [
    /[\(\[]\s*(TEA|TSA|ME)\s*[-–/]\s*(\d{4})\s*[\)\]]/i,
    /^\s*(TEA|TSA|ME)\s*[-–/]\s*(\d{4})\b/i,
    /\b(TEA|TSA|ME)\s*[-–/]\s*(\d{4})\b/i,
  ];

  for (const regex of patterns) {
    const match = text.match(regex);
    if (!match) continue;

    let year = Number(match[2]);
    if (year > 2026 && year < 2200) {
      // Corrige typos comuns como 2107 -> 2017.
      year -= 100;
    }

    if (Number.isFinite(year) && year >= 1990 && year <= 2026) {
      return year;
    }
  }

  return null;
}

function normalizePromptKey(prompt) {
  const text = normalizeText(prompt)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (!text) return "";

  return text
    .replace(/^[\(\[]\s*(tea|tsa|me)\s*(?:[-–/]\s*\d{4})?\s*[\)\]]\s*/i, "")
    .replace(/^\s*(tea|tsa|me)\s*[-–/]\s*\d{4}\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s\-_/()]+/g, " ")
    .toLowerCase()
    .trim();
}

function parseExamType({ prompt, proofLabel, currentExamType }) {
  const current = normalizeText(currentExamType).toUpperCase();
  if (["TEA", "TSA", "ME"].includes(current)) return current;

  const promptText = normalizeText(prompt);
  const proofText = normalizeText(proofLabel);

  const promptMatch = promptText.match(/\b(TEA|TSA|ME)\b/i);
  if (promptMatch) return promptMatch[1].toUpperCase();

  const normalizedProof = normalizeKey(proofText);
  if (!normalizedProof) return "";
  if (normalizedProof.includes("tsa")) return "TSA";
  if (normalizedProof.includes("tea")) return "TEA";
  if (
    normalizedProof.includes("residencia me") ||
    normalizedProof.includes("medicos em especializacao") ||
    normalizedProof.startsWith("me ")
  ) {
    return "ME";
  }

  return "";
}

async function main() {
  const apply = Boolean(getArg("--apply"));
  const collectionName = normalizeText(getArg("--collection")) || "questionsBank";

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
  const [snap, examCatalogSnap] = await Promise.all([
    db.collection(collectionName).get(),
    db.collection("catalog_provas").get(),
  ]);

  const examCatalog = examCatalogSnap.docs.map((docSnap) => {
    const data = docSnap.data() || {};
    return {
      id: docSnap.id,
      keys: new Set(
        [
          normalizeKey(data.code),
          normalizeKey(data.title),
        ].filter(Boolean)
      ),
    };
  });

  // Alias fixos para resolver TEA/TSA/ME independentemente de como o catálogo foi cadastrado.
  for (const exam of examCatalog) {
    const keys = Array.from(exam.keys);
    if (keys.some((k) => k.includes("titulo de especialista em anestesiologia"))) exam.keys.add("tea");
    if (keys.some((k) => k.includes("titulo superior em anestesiologia"))) exam.keys.add("tsa");
    if (keys.some((k) => k.includes("medicos em especializacao") || k.includes("residencia me"))) exam.keys.add("me");
  }

  const knownYearByPrompt = new Map();
  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const prompt = normalizeText(data.prompt_text) || normalizeText(data.prompt);
    const year = parseYearFromPrompt(prompt);
    if (!year) continue;

    const key = normalizePromptKey(prompt);
    if (!key) continue;

    const current = knownYearByPrompt.get(key) || new Set();
    current.add(year);
    knownYearByPrompt.set(key, current);
  }

  const pendingUpdates = [];
  let yearFixCount = 0;
  let activeFixCount = 0;
  let bothFixCount = 0;
  let examTypeFixCount = 0;
  let examIdFixCount = 0;
  let noYearFoundCount = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const prompt = normalizeText(data.prompt_text) || normalizeText(data.prompt);
    let extractedYear = parseYearFromPrompt(prompt);
    if (extractedYear == null) {
      const key = normalizePromptKey(prompt);
      const candidates = key ? knownYearByPrompt.get(key) : null;
      if (candidates && candidates.size === 1) {
        extractedYear = Number(Array.from(candidates)[0]);
      }
    }

    const currentExamYear =
      typeof data.examYear === "number"
        ? data.examYear
        : Number.isFinite(Number(data.examYear))
          ? Number(data.examYear)
          : null;

    const yearNeedsFix = extractedYear != null && extractedYear !== currentExamYear;
    const activeNeedsFix = data.isActive !== true || normalizeText(data.status).toLowerCase() !== "ativo";
    const parsedExamType = parseExamType({
      prompt,
      proofLabel: normalizeText(data.Prova) || normalizeText(data.examSource),
      currentExamType: normalizeText(data.examType) || normalizeText(data.prova_tipo),
    });
    const currentExamType = normalizeText(data.examType || data.prova_tipo).toUpperCase();
    const examTypeNeedsFix = Boolean(parsedExamType) && parsedExamType !== currentExamType;

    const expectedExamId = parsedExamType
      ? (examCatalog.find((item) => item.keys.has(normalizeKey(parsedExamType)))?.id ?? null)
      : null;
    const currentExamId = normalizeText(data.examId);
    const examIdNeedsFix = Boolean(expectedExamId) && expectedExamId !== currentExamId;

    if (extractedYear == null) noYearFoundCount += 1;
    if (yearNeedsFix || activeNeedsFix || examTypeNeedsFix || examIdNeedsFix) {
      if (yearNeedsFix) yearFixCount += 1;
      if (activeNeedsFix) activeFixCount += 1;
      if (yearNeedsFix && activeNeedsFix) bothFixCount += 1;
      if (examTypeNeedsFix) examTypeFixCount += 1;
      if (examIdNeedsFix) examIdFixCount += 1;

      const payload = {
        isActive: true,
        status: "ativo",
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (yearNeedsFix) {
        payload.examYear = extractedYear;
        payload.prova_ano = extractedYear;
      }
      if (examTypeNeedsFix) {
        payload.examType = parsedExamType;
        payload.prova_tipo = parsedExamType;
      }
      if (examIdNeedsFix) {
        payload.examId = expectedExamId;
      }

      pendingUpdates.push({ id: docSnap.id, payload });
    }
  }

  console.log(`Coleção alvo: ${collectionName}`);
  console.log(`Total lido: ${snap.size}`);
  console.log(`Com ano extraído do enunciado: ${snap.size - noYearFoundCount}`);
  console.log(`Sem ano no enunciado: ${noYearFoundCount}`);
  console.log(`Correções de ano: ${yearFixCount}`);
  console.log(`Correções de ativo/status: ${activeFixCount}`);
  console.log(`Correções de ambos: ${bothFixCount}`);
  console.log(`Correções de examType/prova_tipo: ${examTypeFixCount}`);
  console.log(`Correções de examId: ${examIdFixCount}`);
  console.log(`Total para atualizar: ${pendingUpdates.length}`);

  if (!apply) {
    console.log("");
    console.log("Dry-run concluído. Para aplicar:");
    console.log(`node scripts/fix-questions-metadata.mjs --apply --collection=${collectionName}`);
    return;
  }

  if (pendingUpdates.length === 0) {
    console.log("Nada para atualizar.");
    return;
  }

  const chunkSize = 400;
  const commits = [];
  for (let i = 0; i < pendingUpdates.length; i += chunkSize) {
    const group = pendingUpdates.slice(i, i + chunkSize);
    const batch = db.batch();
    for (const item of group) {
      batch.update(db.collection(collectionName).doc(item.id), item.payload);
    }
    commits.push(batch.commit());
  }

  await Promise.all(commits);
  console.log(`Atualização concluída. Documentos atualizados: ${pendingUpdates.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
