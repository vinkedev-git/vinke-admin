// src/lib/firebaseAdmin.ts
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

// Inicialização preguiçosa: o build do Next importa as rotas de API para
// coletar metadados, e os segredos FIREBASE_ADMIN_* só existem em runtime.
let _app: App | null = null;

function adminApp(): App {
  if (_app) return _app;
  if (getApps().length > 0) {
    _app = getApps()[0];
    return _app;
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

  _app = initializeApp({
    credential: cert({
      projectId,
      clientEmail: requiredEnv("FIREBASE_ADMIN_CLIENT_EMAIL"),
      privateKey,
    }),
    storageBucket,
  });
  return _app;
}

// Proxies preservam a API dos exports (adminAuth.xxx / adminDb.xxx) adiando a
// criação do SDK para o primeiro uso real.
function lazy<T extends object>(factory: () => T): T {
  let inst: T | undefined;
  return new Proxy({} as T, {
    get(_target, prop) {
      inst ??= factory();
      const value = Reflect.get(inst as object, prop, inst);
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(inst) : value;
    },
  });
}

export const adminAuth: Auth = lazy(() => getAuth(adminApp()));
export const adminDb: Firestore = lazy(() => getFirestore(adminApp()));
