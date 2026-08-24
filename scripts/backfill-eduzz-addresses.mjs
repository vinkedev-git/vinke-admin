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

function pickFirstString(...vals) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

function normalizeEmail(v) {
  return String(v ?? "").trim().toLowerCase();
}

const STATE_NAME_BY_UF = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

const STATE_NAME_BY_NORMALIZED = Object.fromEntries(
  Object.values(STATE_NAME_BY_UF).map((name) => [
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase(),
    name,
  ])
);

function normalizeStateName(value) {
  const raw = pickFirstString(value);
  if (!raw) return null;

  const upper = raw.toUpperCase();
  if (STATE_NAME_BY_UF[upper]) {
    return STATE_NAME_BY_UF[upper];
  }

  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return STATE_NAME_BY_NORMALIZED[normalized] || raw;
}

function resolveAddressSource(...sources) {
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;

    const nested = source.address;
    if (nested && typeof nested === "object") {
      const nestedAddress = nested;
      const hasNestedValue = [
        nestedAddress.street,
        nestedAddress.number,
        nestedAddress.neighborhood,
        nestedAddress.complement,
        nestedAddress.city,
        nestedAddress.state,
        nestedAddress.zipCode,
        nestedAddress.country,
      ].some((value) => pickFirstString(value));

      if (hasNestedValue) {
        return nestedAddress;
      }
    }

    const hasFlatValue = [
      source.street,
      source.number,
      source.neighborhood,
      source.complement,
      source.city,
      source.state,
      source.zipCode,
      source.country,
    ].some((value) => pickFirstString(value));

    if (hasFlatValue) {
      return source;
    }
  }

  return {};
}

function buildAddressFromEvent(data) {
  const studentProfile = data?.student || {};
  const buyerProfile = data?.buyer || {};
  const customerProfile = data?.customer || data?.client || {};
  const profileSource =
    Object.keys(studentProfile).length > 0
      ? studentProfile
      : Object.keys(buyerProfile).length > 0
        ? buyerProfile
        : customerProfile;

  const address = resolveAddressSource(profileSource, buyerProfile, customerProfile, data?.address);

  return {
    street: pickFirstString(address.street) || null,
    number: pickFirstString(address.number) || null,
    neighborhood: pickFirstString(address.neighborhood) || null,
    complement: pickFirstString(address.complement) || null,
    zipCode: pickFirstString(address.zipCode) || null,
    city: pickFirstString(address.city) || null,
    state: normalizeStateName(address.state),
    country: pickFirstString(address.country) || null,
  };
}

function mergeAddress(currentAddress, nextAddress) {
  const merged = {};
  let changed = false;

  for (const [key, nextValue] of Object.entries(nextAddress)) {
    const currentValue =
      key === "state"
        ? normalizeStateName(currentAddress?.[key]) || ""
        : pickFirstString(currentAddress?.[key]);
    const incomingValue =
      key === "state"
        ? normalizeStateName(nextValue) || ""
        : pickFirstString(nextValue);

    if (currentValue) {
      merged[key] = currentValue;
      if (key === "state" && currentValue !== currentAddress?.[key]) {
        changed = true;
      }
      continue;
    }

    if (incomingValue) {
      merged[key] = incomingValue;
      changed = true;
      continue;
    }

    merged[key] = currentAddress?.[key] ?? null;
  }

  return { merged, changed };
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

async function buildUserEmailMap() {
  const snap = await db.collection("users").where("role", "==", "student").get();
  const map = new Map();

  snap.docs.forEach((doc) => {
    const email = normalizeEmail(doc.data()?.email);
    if (email) {
      map.set(email, doc.id);
    }
  });

  return map;
}

async function backfill() {
  const emailToUid = await buildUserEmailMap();
  const eventsSnap = await db.collection("eduzz_events").get();

  let scanned = 0;
  let matchedUsers = 0;
  let updatedProfiles = 0;
  let skippedWithoutAddress = 0;

  for (const eventDoc of eventsSnap.docs) {
    scanned += 1;
    const eventData = eventDoc.data() ?? {};
    const raw = eventData.raw ?? {};
    const payload = raw?.data && typeof raw.data === "object" ? raw.data : {};

    const email = normalizeEmail(
      payload?.student?.email ??
        payload?.customer?.email ??
        payload?.buyer?.email ??
        payload?.client?.email ??
        payload?.email ??
        payload?.edz_cli_email
    );

    if (!email) continue;

    const uid = emailToUid.get(email);
    if (!uid) continue;
    matchedUsers += 1;

    const nextAddress = buildAddressFromEvent(payload);
    const hasIncomingAddress = Object.values(nextAddress).some((value) => pickFirstString(value));
    if (!hasIncomingAddress) {
      skippedWithoutAddress += 1;
      continue;
    }

    const profileRef = db.collection("users").doc(uid).collection("profile").doc("main");
    const profileSnap = await profileRef.get();
    const profile = profileSnap.exists ? profileSnap.data() ?? {} : {};
    const currentAddress =
      profile.address && typeof profile.address === "object" ? profile.address : {};

    const { merged, changed } = mergeAddress(currentAddress, nextAddress);
    if (!changed) continue;

    await profileRef.set(
      {
        address: merged,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    updatedProfiles += 1;
  }

  console.log(`Eventos verificados: ${scanned}`);
  console.log(`Alunos encontrados por email: ${matchedUsers}`);
  console.log(`Perfis atualizados: ${updatedProfiles}`);
  console.log(`Eventos sem endereco aproveitavel: ${skippedWithoutAddress}`);
}

backfill()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
