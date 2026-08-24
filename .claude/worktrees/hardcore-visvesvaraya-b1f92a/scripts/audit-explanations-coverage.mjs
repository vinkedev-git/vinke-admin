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

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key]) continue;

    let value = trimmed.slice(eq + 1).trim();
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

function htmlToText(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
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
  const snap = await db.collection("questionsBank").get();

  let total = 0;
  let hasExplanationField = 0;
  let nonEmptyRaw = 0;
  let meaningful = 0;
  let htmlEmpty = 0;
  let comingSoonOnly = 0;
  let comingSoonMention = 0;

  const samples = [];
  const comingSoonSamples = [];

  for (const docSnap of snap.docs) {
    total += 1;
    const raw = docSnap.data()?.explanation;
    if (typeof raw !== "string") continue;
    hasExplanationField += 1;
    if (raw.trim()) nonEmptyRaw += 1;

    const text = htmlToText(raw);
    const normalized = text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const hasComingSoon = normalized.includes("em breve comentario disponivel");

    if (hasComingSoon) {
      comingSoonMention += 1;
    }

    if (hasComingSoon && normalized.replace(/[.!?\s]+/g, " ").trim() === "em breve comentario disponivel") {
      comingSoonOnly += 1;
      if (comingSoonSamples.length < 10) {
        comingSoonSamples.push({ id: docSnap.id, raw: raw.slice(0, 160) });
      }
    }

    if (text.length > 0) {
      meaningful += 1;
    } else {
      htmlEmpty += 1;
      if (samples.length < 10) {
        samples.push({ id: docSnap.id, raw: raw.slice(0, 160) });
      }
    }
  }

  console.log({
    total,
    hasExplanationField,
    nonEmptyRaw,
    meaningful,
    htmlEmpty,
    comingSoonMention,
    comingSoonOnly,
  });
  if (samples.length) {
    console.log("samples_html_empty:");
    for (const item of samples) {
      console.log(`- ${item.id}: ${JSON.stringify(item.raw)}`);
    }
  }
  if (comingSoonSamples.length) {
    console.log("samples_coming_soon:");
    for (const item of comingSoonSamples) {
      console.log(`- ${item.id}: ${JSON.stringify(item.raw)}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
