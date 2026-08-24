import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

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
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
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

function normalizeKey(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[()\-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

const EXAM_ALIASES = {
  tsa: ["titulo superior em anestesiologia", "tsa titulo superior em anestesiologia"],
  tea: ["titulo de especialista em anestesiologia", "tea titulo de especialista em anestesiologia"],
  me: ["residencia me", "medicos em especializacao", "residencia (me - medicos em especializacao)"],
};

const THEME_ALIASES = {
  "anestesicos locais": ["farmacologia dos anestesicos locais"],
  "anestesicos venosos": ["anestesicos venosos"],
  "anestesia local": ["farmacologia dos anestesicos locais"],
  "cardiovascular": ["anestesia e sistema cardiovascular", "fisiologia e farmacologia do sistema cardiocirculatorio"],
  "respiratorio": ["fisiologia e farmacologia do sistema respiratorio"],
  "urinario": ["fisiologia e farmacologia do sistema urinario"],
  "sistema cardiocirculatorio": ["fisiologia e farmacologia do sistema cardiocirculatorio"],
  "sistema respiratorio": ["fisiologia e farmacologia do sistema respiratorio"],
  "sistema urinario": ["fisiologia e farmacologia do sistema urinario"],
  "etica medica e bioetica responsabilidade profissional do anestesiologista": [
    "etica medica e bioetica. responsabilidade e risco profissional do anestesiologista",
    "etica medica e bioetica responsabilidade e risco profissional do anestesiologista",
  ],
  "etica medica e bioetica. responsabilidade profissional do anestesiologista": [
    "etica medica e bioetica. responsabilidade e risco profissional do anestesiologista",
  ],
};

function buildExamKeys(data) {
  const baseKeys = new Set([
    normalizeKey(data.code),
    normalizeKey(data.title),
  ].filter(Boolean));

  const codeKey = normalizeKey(data.code);
  if (codeKey && EXAM_ALIASES[codeKey]) {
    for (const alias of EXAM_ALIASES[codeKey]) {
      baseKeys.add(normalizeKey(alias));
    }
  }

  const normalizedTitle = normalizeKey(data.title);
  if (normalizedTitle) {
    for (const [code, aliases] of Object.entries(EXAM_ALIASES)) {
      if (
        normalizedTitle === code ||
        normalizedTitle.startsWith(`${code} `) ||
        normalizedTitle.includes(` ${code} `) ||
        normalizedTitle.endsWith(` ${code}`)
      ) {
        baseKeys.add(code);
      }
      for (const alias of aliases) {
        const normalizedAlias = normalizeKey(alias);
        if (normalizedTitle.includes(normalizedAlias) || normalizedAlias.includes(normalizedTitle)) {
          baseKeys.add(code);
          baseKeys.add(normalizedAlias);
        }
      }
    }
  }

  return baseKeys;
}

function buildThemeKeys(data) {
  const baseKeys = new Set([normalizeKey(data.title)].filter(Boolean));
  const normalizedTitle = normalizeKey(data.title);

  for (const [alias, targets] of Object.entries(THEME_ALIASES)) {
    const normalizedAlias = normalizeKey(alias);
    const normalizedTargets = targets.map((item) => normalizeKey(item));
    if (
      normalizedTargets.includes(normalizedTitle) ||
      normalizedTargets.some((target) => normalizedTitle.includes(target) || target.includes(normalizedTitle))
    ) {
      baseKeys.add(normalizedAlias);
      for (const target of normalizedTargets) {
        baseKeys.add(target);
      }
    }
  }

  if (normalizedTitle.startsWith("farmacologia dos ")) {
    baseKeys.add(normalizedTitle.replace(/^farmacologia dos /, ""));
  }

  if (normalizedTitle.startsWith("fisiologia e farmacologia do ")) {
    baseKeys.add(normalizedTitle.replace(/^fisiologia e farmacologia do /, ""));
  }

  if (normalizedTitle.startsWith("anestesia para ")) {
    baseKeys.add(normalizedTitle.replace(/^anestesia para /, ""));
  }

  if (normalizedTitle.startsWith("anestesia em ")) {
    baseKeys.add(normalizedTitle.replace(/^anestesia em /, ""));
  }

  return baseKeys;
}

function resolveThemeRef(items, rawTheme, levelId) {
  const normalizedTheme = normalizeKey(rawTheme);

  const exactSameLevelMatch = items.find((item) => {
    if (!item.keys.has(normalizedTheme)) return false;
    return !item.levelId || !levelId || item.levelId === levelId;
  });

  if (exactSameLevelMatch) return exactSameLevelMatch;

  const exactAnyLevelMatch = items.find((item) => item.keys.has(normalizedTheme));

  if (exactAnyLevelMatch) return exactAnyLevelMatch;

  const fuzzySameLevelMatch = items.find((item) => {
    const keys = Array.from(item.keys);
    const keyMatch = keys.some(
      (key) =>
        key === normalizedTheme ||
        key.includes(normalizedTheme) ||
        normalizedTheme.includes(key)
    );

    if (!keyMatch) return false;
    return !item.levelId || !levelId || item.levelId === levelId;
  });

  if (fuzzySameLevelMatch) return fuzzySameLevelMatch;

  const fuzzyAnyLevelMatch = items.find((item) => {
    const keys = Array.from(item.keys);
    return keys.some(
      (key) =>
        key === normalizedTheme ||
        key.includes(normalizedTheme) ||
        normalizedTheme.includes(key)
    );
  });

  return fuzzyAnyLevelMatch ?? null;
}

function parseBool(value) {
  const normalized = normalizeKey(value);
  if (!normalized) return false;
  return ["1", "true", "sim", "yes", "ativo", "active"].includes(normalized);
}

function parseBoolWithDefault(value, defaultValue) {
  const normalized = normalizeKey(value);
  if (!normalized) return defaultValue;
  if (["1", "true", "sim", "yes", "ativo", "active", "on", "ligado"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "nao", "não", "no", "off", "desligado"].includes(normalized)) {
    return false;
  }
  return defaultValue;
}

function parseYear(value) {
  const raw = normalizeText(value);
  if (!raw) return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseThemes(value) {
  const raw = normalizeText(value);
  if (!raw) return [];

  if (raw.startsWith("[") && raw.endsWith("]")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => normalizeText(item))
          .filter(Boolean);
      }
    } catch {
      // segue para o split padrão
    }
  }

  return raw
    .split(/\s*[|;,]\s*/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function buildProofLabel(examType, examYear, fallback) {
  const normalizedFallback = normalizeText(fallback);
  if (normalizedFallback) return normalizedFallback;

  const type = normalizeText(examType);
  const year = normalizeText(examYear);
  if (!type && !year) return "";
  if (!type) return year;
  if (!year) return type;
  return `(${type}-${year})`;
}

function chunk(array, size) {
  const items = [];
  for (let index = 0; index < array.length; index += size) {
    items.push(array.slice(index, index + size));
  }
  return items;
}

function parseWorkbookRows(filePath, sheetName = "firebase_import") {
  const workbook = xlsx.readFile(filePath, { raw: false, cellDates: false });
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error(`Worksheet not found: ${sheetName}`);
  }

  const parsed = xlsx.utils.sheet_to_json(sheet, {
    raw: false,
    defval: null,
    blankrows: false,
  });

  if (!Array.isArray(parsed)) return [];

  return parsed.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return {};
    const normalized = {};
    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = normalizeText(key);
      if (!normalizedKey) continue;
      normalized[normalizedKey] = value;
    }
    return normalized;
  });
}

function resolveCatalogRef(items, keyCandidates) {
  for (const item of items) {
    for (const key of keyCandidates) {
      if (item.keys.has(normalizeKey(key))) {
        return item;
      }
    }
  }
  return null;
}

async function loadCatalogContext(db) {
  const [examSnap, levelSnap, themeSnap] = await Promise.all([
    db.collection("catalog_provas").get(),
    db.collection("catalog_niveis").get(),
    db.collection("catalog_temas").get(),
  ]);

  const exams = examSnap.docs.map((docSnap) => {
    const data = docSnap.data() || {};
    return {
      id: docSnap.id,
      code: normalizeText(data.code),
      title: normalizeText(data.title),
      keys: buildExamKeys(data),
    };
  });

  const levels = levelSnap.docs.map((docSnap) => {
    const data = docSnap.data() || {};
    return {
      id: docSnap.id,
      code: normalizeText(data.code),
      title: normalizeText(data.title),
      keys: new Set([
        normalizeKey(data.code),
        normalizeKey(data.title),
      ].filter(Boolean)),
    };
  });

  const themes = themeSnap.docs.map((docSnap) => {
    const data = docSnap.data() || {};
    return {
      id: docSnap.id,
      title: normalizeText(data.title),
      levelId: normalizeText(data.levelId),
      levelLabel: normalizeText(data.levelLabel),
      status: normalizeKey(data.status) || "ativo",
      keys: buildThemeKeys(data),
    };
  });

  return { exams, levels, themes };
}

function buildQuestionRecord(row, { existing = null, catalogs = null } = {}) {
  const docId = normalizeText(row.docId);
  const prompt = normalizeText(row.prompt_text);
  const correctOptionId = normalizeText(row.correctOptionId).toUpperCase();
  const rawExamType = normalizeText(row.prova_tipo).toUpperCase();
  const examType = rawExamType === "-" ? "" : rawExamType;
  const examYear = parseYear(row.prova_ano);
  const rawLevel = normalizeText(row.nivel).toUpperCase();
  const level = rawLevel === "TODOS" ? "" : rawLevel;
  const proofLabel = buildProofLabel(examType, row.prova_ano, row.Prova);
  const themes = parseThemes(row.themes);
  const isActive = parseBool(row.isActive);
  const shuffleOptions = parseBoolWithDefault(row.shuffleOptions, true);
  const warnings = [];
  const errors = [];

  if (!docId) errors.push("docId vazio.");
  if (!prompt) errors.push("prompt_text vazio.");

  const options = ["A", "B", "C", "D"].map((optionId) => {
    const text = normalizeText(row[`option${optionId}_text`]);
    const imageUrl = normalizeText(row[`option${optionId}_imageUrl`]) || null;
    if (!text) {
      errors.push(`option${optionId}_text vazio.`);
    }
    return { id: optionId, text, imageUrl };
  });

  if (!["A", "B", "C", "D"].includes(correctOptionId)) {
    errors.push(`correctOptionId inválido: ${normalizeText(row.correctOptionId) || "(vazio)"}.`);
  }

  let examId = null;
  let levelId = null;
  let themeIds = [];

  if (catalogs) {
    if (examType) {
      const examMatch = resolveCatalogRef(catalogs.exams, [examType]);
      examId = examMatch?.id ?? null;
      if (!examId) {
        warnings.push(`prova_tipo sem correspondência em catalog_provas: ${examType}`);
      }
    }

    if (level) {
      const levelMatch = resolveCatalogRef(catalogs.levels, [level]);
      levelId = levelMatch?.id ?? null;
      if (!levelId) {
        warnings.push(`nivel sem correspondência em catalog_niveis: ${level}`);
      }
    }

    const seenThemeIds = new Set();
    for (const theme of themes) {
      const match = resolveThemeRef(catalogs.themes, theme, levelId);

      if (!match) {
        warnings.push(`tema sem correspondência em catalog_temas: ${theme}`);
        continue;
      }

      if (!seenThemeIds.has(match.id)) {
        seenThemeIds.add(match.id);
        themeIds.push(match.id);
      }
    }
  }

  const optionMap = Object.fromEntries(options.map((option) => [option.id, option]));
  const existingData = existing || {};

  const payload = {
    prompt,
    prompt_text: prompt,
    explanation: normalizeText(row.explanation),
    explanationFormat: "html",
    examId,
    examType,
    prova_tipo: examType,
    levelId,
    examYear,
    prova_ano: examYear,
    examSource: proofLabel,
    Prova: proofLabel,
    level,
    nivel: level,
    themes,
    themeIds,
    isActive,
    status: isActive ? "ativo" : "inativo",
    imageUrl: normalizeText(row.imageUrl) || null,
    options,
    optionA_text: optionMap.A?.text ?? "",
    optionA_imageUrl: optionMap.A?.imageUrl ?? null,
    optionB_text: optionMap.B?.text ?? "",
    optionB_imageUrl: optionMap.B?.imageUrl ?? null,
    optionC_text: optionMap.C?.text ?? "",
    optionC_imageUrl: optionMap.C?.imageUrl ?? null,
    optionD_text: optionMap.D?.text ?? "",
    optionD_imageUrl: optionMap.D?.imageUrl ?? null,
    correctOptionId,
    shuffleOptions,
    reference: normalizeText(row.reference),
    internalNote:
      normalizeText(row.internalNote) ||
      normalizeText(row["Nota interna"]) ||
      normalizeText(row.observacao) ||
      (typeof existingData.internalNote === "string" ? existingData.internalNote : ""),
    commentAttachments: Array.isArray(existingData.commentAttachments) ? existingData.commentAttachments : [],
    createdAt: existingData.createdAt ?? FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  return { docId, payload, errors, warnings };
}

function resolveFilePath(inputPath) {
  const raw = normalizeText(inputPath);
  if (!raw) {
    throw new Error("Informe a planilha com --file=/caminho/para/arquivo.xlsx");
  }

  const filePath = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }
  return filePath;
}

function summarizeValidation(records) {
  const invalid = records.filter((item) => item.errors.length > 0);
  const warnings = records.flatMap((item) =>
    item.warnings.map((warning) => `${item.docId || "(sem docId)"}: ${warning}`)
  );

  return {
    total: records.length,
    invalidCount: invalid.length,
    warningCount: warnings.length,
    invalid,
    warnings,
  };
}

async function main() {
  const apply = Boolean(getArg("--apply"));
  const prune = Boolean(getArg("--prune"));
  const skipInvalid = Boolean(getArg("--skip-invalid"));
  const filePath = resolveFilePath(getArg("--file"));
  const collectionName = normalizeText(getArg("--collection")) || "questionsBank";

  if (prune && !apply) {
    throw new Error("--prune só pode ser usado junto com --apply.");
  }

  const rows = parseWorkbookRows(filePath, "firebase_import");

  const duplicateIds = new Set();
  const seenIds = new Set();
  for (const row of rows) {
    const docId = normalizeText(row.docId);
    if (!docId) continue;
    if (seenIds.has(docId)) duplicateIds.add(docId);
    seenIds.add(docId);
  }

  if (duplicateIds.size > 0) {
    throw new Error(`Planilha com docId duplicado: ${Array.from(duplicateIds).join(", ")}`);
  }

  if (!apply) {
    const records = rows.map((row) => buildQuestionRecord(row));
    const summary = summarizeValidation(records);

    console.log(`Dry-run concluído para ${filePath}`);
    console.log(`Coleção alvo: ${collectionName}`);
    console.log(`Linhas lidas: ${summary.total}`);
    console.log(`Registros inválidos: ${summary.invalidCount}`);
    console.log(`Avisos: ${summary.warningCount}`);

    if (summary.invalidCount > 0) {
      console.log("");
      console.log("Registros inválidos (primeiros 20):");
      for (const item of summary.invalid.slice(0, 20)) {
        console.log(`- ${item.docId || "(sem docId)"} -> ${item.errors.join(" | ")}`);
      }
    }

    if (summary.warningCount > 0) {
      console.log("");
      console.log("Avisos (primeiros 20):");
      for (const warning of summary.warnings.slice(0, 20)) {
        console.log(`- ${warning}`);
      }
    }

    console.log("");
    console.log("Para aplicar no Firestore:");
    console.log(`node scripts/sync-questions-from-xlsx.mjs --file=\"${filePath}\" --apply`);
    console.log("Para aplicar ignorando apenas as linhas inválidas:");
    console.log(`node scripts/sync-questions-from-xlsx.mjs --file=\"${filePath}\" --apply --skip-invalid`);
    console.log("Para substituir e remover questões ausentes na planilha:");
    console.log(`node scripts/sync-questions-from-xlsx.mjs --file=\"${filePath}\" --apply --prune`);
    return;
  }

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
  const [currentSnap, catalogs] = await Promise.all([
    db.collection(collectionName).get(),
    loadCatalogContext(db),
  ]);

  const currentDocs = new Map(currentSnap.docs.map((docSnap) => [docSnap.id, docSnap.data()]));
  const records = rows.map((row) =>
    buildQuestionRecord(row, {
      existing: currentDocs.get(normalizeText(row.docId)) ?? null,
      catalogs,
    })
  );
  const summary = summarizeValidation(records);

  if (summary.invalidCount > 0) {
    if (skipInvalid) {
      console.log(`Ignorando ${summary.invalidCount} registros inválidos por causa de --skip-invalid.`);
    } else {
      console.log(`Importação abortada: ${summary.invalidCount} registros inválidos.`);
      for (const item of summary.invalid.slice(0, 20)) {
        console.log(`- ${item.docId || "(sem docId)"} -> ${item.errors.join(" | ")}`);
      }
      process.exit(1);
    }
  }

  const validRecords = skipInvalid
    ? records.filter((item) => item.errors.length === 0)
    : records;

  if (validRecords.length === 0) {
    throw new Error("Nenhum registro válido para importar.");
  }

  if (summary.invalidCount > 0 && !skipInvalid) {
    console.log(`Importação abortada: ${summary.invalidCount} registros inválidos.`);
    for (const item of summary.invalid.slice(0, 20)) {
      console.log(`- ${item.docId || "(sem docId)"} -> ${item.errors.join(" | ")}`);
    }
    process.exit(1);
  }

  const incomingIds = new Set(validRecords.map((item) => item.docId));
  const createCount = validRecords.filter((item) => !currentDocs.has(item.docId)).length;
  const updateCount = validRecords.length - createCount;
  const deleteIds = prune
    ? currentSnap.docs
        .map((docSnap) => docSnap.id)
        .filter((id) => !incomingIds.has(id))
    : [];

  const writeBatches = [];
  for (const group of chunk(validRecords, 400)) {
    const batch = db.batch();
    for (const item of group) {
      batch.set(db.collection(collectionName).doc(item.docId), item.payload);
    }
    writeBatches.push(batch.commit());
  }

  if (deleteIds.length > 0) {
    for (const group of chunk(deleteIds, 400)) {
      const batch = db.batch();
      for (const id of group) {
        batch.delete(db.collection(collectionName).doc(id));
      }
      writeBatches.push(batch.commit());
    }
  }

  await Promise.all(writeBatches);

  console.log(`Atualização concluída na coleção ${collectionName}.`);
  console.log(`Linhas válidas processadas: ${validRecords.length}`);
  console.log(`Linhas inválidas ignoradas: ${skipInvalid ? summary.invalidCount : 0}`);
  console.log(`Criadas: ${createCount}`);
  console.log(`Atualizadas: ${updateCount}`);
  console.log(`Excluídas: ${deleteIds.length}`);
  console.log(`Avisos: ${summary.warningCount}`);

  if (summary.warningCount > 0) {
    console.log("");
    console.log("Avisos (primeiros 30):");
    for (const warning of summary.warnings.slice(0, 30)) {
      console.log(`- ${warning}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
