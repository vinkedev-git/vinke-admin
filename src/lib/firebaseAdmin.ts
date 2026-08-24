// src/lib/firebaseAdmin.ts
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const privateKey = requiredEnv("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n");
const projectId = requiredEnv("FIREBASE_ADMIN_PROJECT_ID");

// Bucket padrao do Firebase Storage — necessario para que uploads via
// getStorage().bucket() funcionem sem passar o nome explicito.
// Projetos criados apos out/2024 usam .firebasestorage.app (nao .appspot.com).
const storageBucket =
  process.env.FIREBASE_STORAGE_BUCKET ||
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
  `${projectId}.firebasestorage.app`;

const app =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert({
          projectId,
          clientEmail: requiredEnv("FIREBASE_ADMIN_CLIENT_EMAIL"),
          privateKey,
        }),
        storageBucket,
      });

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);