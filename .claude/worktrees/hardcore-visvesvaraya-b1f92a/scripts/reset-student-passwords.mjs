import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
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

function pickString(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  return "";
}

function getArg(flag, fallback = "") {
  const found = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (!found) return fallback;
  return found.slice(flag.length + 1).trim();
}

const apply = process.argv.includes("--apply");
const password = getArg("--password", "12345678");

if (password.length < 6) {
  throw new Error("A senha precisa ter no mínimo 6 caracteres.");
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
const auth = getAuth(app);

async function getStudentUsers() {
  const snap = await db.collection("users").where("role", "==", "student").get();
  return snap.docs
    .map((doc) => {
      const data = doc.data() ?? {};
      return {
        uid: doc.id,
        email: pickString(data.email),
      };
    })
    .filter((row) => row.uid && row.email);
}

async function run() {
  const students = await getStudentUsers();
  if (!students.length) {
    console.log("Nenhum aluno encontrado com role=student.");
    return;
  }

  console.log(`Alunos encontrados: ${students.length}`);
  console.log(`Modo: ${apply ? "APLICAR" : "SIMULACAO (dry-run)"}`);

  if (!apply) {
    console.log("Nenhuma senha foi alterada. Rode com --apply para aplicar.");
    console.log("Exemplo: node scripts/reset-student-passwords.mjs --apply --password=12345678");
    return;
  }

  let updated = 0;
  let failed = 0;

  for (const student of students) {
    try {
      await auth.updateUser(student.uid, { password });
      updated += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Falha em ${student.uid} (${student.email}): ${message}`);
    }
  }

  console.log(`Concluido. Atualizados: ${updated}. Falhas: ${failed}.`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
