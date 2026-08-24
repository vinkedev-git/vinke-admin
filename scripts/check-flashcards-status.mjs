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

const decksSnap = await db.collection("flashcardDecks").get();
const deckStats = {};
decksSnap.docs.forEach((d) => {
  const { status, isActive } = d.data();
  const key = `status=${status} isActive=${isActive}`;
  deckStats[key] = (deckStats[key] || 0) + 1;
});
console.log(`flashcardDecks: ${decksSnap.size} total`);
console.log(deckStats);

const cardsSnap = await db.collection("flashcards").select("status", "isActive").get();
const cardStats = {};
cardsSnap.docs.forEach((d) => {
  const { status, isActive } = d.data();
  const key = `status=${status} isActive=${isActive}`;
  cardStats[key] = (cardStats[key] || 0) + 1;
});
console.log(`\nflashcards: ${cardsSnap.size} total`);
console.log(cardStats);
