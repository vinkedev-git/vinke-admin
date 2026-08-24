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

const PLANOS = [
  ["1", "Plano Mensal", "EDUZZ_MENSAL", "ativo", 97],
  ["2", "Plano Trimestral", "EDUZZ_TRIMESTRAL", "ativo", 267],
  ["3", "Plano Semestral", "EDUZZ_SEMESTRAL", "ativo", 497],
  ["4", "Plano Anual", "EDUZZ_ANUAL", "ativo", 897],
];

async function seedPlanos() {
  for (const [code, title, productId, status, price] of PLANOS) {
    const ref = db.collection("catalog_planos").doc(`plano_${code.padStart(3, "0")}`);
    const snap = await ref.get();

    await ref.set(
      {
        code,
        title,
        productId,
        status,
        price,
        createdAt: snap.exists
          ? snap.data()?.createdAt ?? FieldValue.serverTimestamp()
          : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
}

seedPlanos()
  .then(() => {
    console.log(`Seed concluido: ${PLANOS.length} planos processados.`);
    console.log("Ajuste os productId placeholders para os IDs reais da Eduzz, se necessario.");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
