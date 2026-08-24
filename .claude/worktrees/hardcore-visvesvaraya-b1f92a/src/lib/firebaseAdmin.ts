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

const app =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert({
          projectId: requiredEnv("FIREBASE_ADMIN_PROJECT_ID"),
          clientEmail: requiredEnv("FIREBASE_ADMIN_CLIENT_EMAIL"),
          privateKey,
        }),
      });

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);