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

function resolveFilePath(inputPath) {
  const raw = normalizeText(inputPath);
  if (!raw) throw new Error("Informe o arquivo com --file=/caminho/arquivo.xlsx");
  const filePath = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  if (!fs.existsSync(filePath)) throw new Error(`Arquivo não encontrado: ${filePath}`);
  return filePath;
}

const ENTITY_MAP = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  Aacute: "Á",
  aacute: "á",
  Acirc: "Â",
  acirc: "â",
  Agrave: "À",
  agrave: "à",
  Atilde: "Ã",
  atilde: "ã",
  Auml: "Ä",
  auml: "ä",
  Eacute: "É",
  eacute: "é",
  Ecirc: "Ê",
  ecirc: "ê",
  Egrave: "È",
  egrave: "è",
  Euml: "Ë",
  euml: "ë",
  Iacute: "Í",
  iacute: "í",
  Icirc: "Î",
  icirc: "î",
  Igrave: "Ì",
  igrave: "ì",
  Iuml: "Ï",
  iuml: "ï",
  Oacute: "Ó",
  oacute: "ó",
  Ocirc: "Ô",
  ocirc: "ô",
  Ograve: "Ò",
  ograve: "ò",
  Otilde: "Õ",
  otilde: "õ",
  Ouml: "Ö",
  ouml: "ö",
  Uacute: "Ú",
  uacute: "ú",
  Ucirc: "Û",
  ucirc: "û",
  Ugrave: "Ù",
  ugrave: "ù",
  Uuml: "Ü",
  uuml: "ü",
  Ccedil: "Ç",
  ccedil: "ç",
  Ntilde: "Ñ",
  ntilde: "ñ",
  ordm: "º",
  ordf: "ª",
  sup2: "²",
  sup3: "³",
};

function decodeEntities(input) {
  let text = normalizeText(input);
  if (!text) return "";

  text = text.replace(/<br\s*\/?>/gi, "\n");

  text = text.replace(/&#(\d+);/g, (_, code) => {
    const n = Number(code);
    return Number.isFinite(n) ? String.fromCodePoint(n) : _;
  });

  text = text.replace(/&#x([0-9a-f]+);/gi, (_, code) => {
    const n = Number.parseInt(code, 16);
    return Number.isFinite(n) ? String.fromCodePoint(n) : _;
  });

  text = text.replace(/&([a-zA-Z]+);/g, (full, name) => ENTITY_MAP[name] ?? full);

  text = text.replace(/<[^>]*>/g, " ");
  text = text.replace(/\u00a0/g, " ");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n[ \t]+/g, "\n");
  text = text.replace(/[ \t]{2,}/g, " ");

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== "&nbsp;")
    .join("\n")
    .trim();
}

function normalizeLoose(value) {
  return normalizeText(value).replace(/\s+/g, " ").toLowerCase();
}

function parseSourceRows(filePath, sheetName) {
  const wb = xlsx.readFile(filePath, { raw: false, cellDates: false });
  const resolvedSheet = sheetName && wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0];
  const ws = wb.Sheets[resolvedSheet];
  if (!ws) throw new Error(`Aba não encontrada: ${resolvedSheet}`);

  const rows = xlsx.utils.sheet_to_json(ws, { raw: false, defval: "" });
  const byDocId = new Map();

  for (const row of rows) {
    const docId = normalizeText(row.ID || row.id || row.docId || row.UUID);
    if (!docId) continue;

    const content = decodeEntities(row["Conteúdo"] || row["Conteudo"]);
    if (!content) continue;

    byDocId.set(docId, {
      docId,
      title: normalizeText(row["Título"] || row["Titulo"] || row.title),
      content,
    });
  }

  return { resolvedSheet, byDocId };
}

async function main() {
  const apply = Boolean(getArg("--apply"));
  const filePath = resolveFilePath(getArg("--file"));
  const sheetName = normalizeText(getArg("--sheet"));
  const collectionName = normalizeText(getArg("--collection")) || "questionsBank";

  const { resolvedSheet, byDocId } = parseSourceRows(filePath, sheetName);

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
  const updates = [];
  let notFound = 0;
  let alreadyMerged = 0;

  for (const [docId, source] of byDocId.entries()) {
    const docSnap = await db.collection(collectionName).doc(docId).get();
    if (!docSnap.exists) {
      notFound += 1;
      continue;
    }

    const data = docSnap.data() || {};
    const currentPrompt = normalizeText(data.prompt_text || data.prompt);
    const mergedCandidate = currentPrompt
      ? `${currentPrompt}\n\n${source.content}`.trim()
      : [source.title, source.content].filter(Boolean).join("\n\n").trim();

    if (!mergedCandidate) continue;

    if (normalizeLoose(currentPrompt).includes(normalizeLoose(source.content))) {
      alreadyMerged += 1;
      continue;
    }

    updates.push({
      docId,
      prompt: mergedCandidate,
      prompt_text: mergedCandidate,
    });
  }

  console.log(`Arquivo origem: ${filePath}`);
  console.log(`Aba lida: ${resolvedSheet}`);
  console.log(`Com conteúdo na planilha: ${byDocId.size}`);
  console.log(`Não encontradas no Firestore: ${notFound}`);
  console.log(`Já continham conteúdo: ${alreadyMerged}`);
  console.log(`Pendentes para atualizar: ${updates.length}`);
  if (updates.length > 0) {
    console.log("Exemplos:");
    for (const item of updates.slice(0, 5)) {
      console.log(`- ${item.docId}: ${item.prompt.slice(0, 120).replace(/\n/g, " ")}...`);
    }
  }

  if (!apply) {
    console.log("");
    console.log("Dry-run concluído. Para aplicar:");
    console.log(
      `node scripts/backfill-question-content-from-xlsx.mjs --file=\"${filePath}\" --sheet=\"${resolvedSheet}\" --apply --collection=${collectionName}`
    );
    return;
  }

  if (updates.length === 0) {
    console.log("Nada para atualizar.");
    return;
  }

  const chunkSize = 400;
  const commits = [];
  for (let i = 0; i < updates.length; i += chunkSize) {
    const group = updates.slice(i, i + chunkSize);
    const batch = db.batch();
    for (const item of group) {
      batch.update(db.collection(collectionName).doc(item.docId), {
        prompt: item.prompt,
        prompt_text: item.prompt_text,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    commits.push(batch.commit());
  }

  await Promise.all(commits);
  console.log(`Atualização concluída. Documentos atualizados: ${updates.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
