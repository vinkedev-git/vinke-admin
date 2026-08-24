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

const LEVELS = [
  { code: "1", title: "R1" },
  { code: "2", title: "R2" },
  { code: "3", title: "R3" },
];

const TEMAS = [
  ["1", "Anestesia Ambulatorial", "R2", "ativo"],
  ["2", "Anestesia Bucomaxilofacial e para Odontologia", "R3", "ativo"],
  ["3", "Anestesia e Sistema Cardiovascular", "R3", "ativo"],
  ["4", "Anestesia e Sistema Endócrino", "R3", "ativo"],
  ["5", "Anestesia em Obstetrícia", "R2", "ativo"],
  ["6", "Anestesia em Ortopedia", "R2", "ativo"],
  ["7", "Anestesia em Pediatria", "R3", "ativo"],
  ["8", "Anestesia em Urgências e no Trauma", "R3", "ativo"],
  ["9", "Anestesia para Cirurgia Abdominal", "R2", "ativo"],
  ["10", "Anestesia para Cirurgia Plástica", "R3", "ativo"],
  ["11", "Anestesia para Cirurgia Torácica", "R3", "ativo"],
  ["12", "Anestesia para geriatria", "R3", "ativo"],
  ["13", "Anestesia para Neurocirurgia", "R3", "ativo"],
  ["14", "Anestesia para Oftalmologia", "R2", "ativo"],
  ["15", "Anestesia para Otorrinolaringologia", "R2", "ativo"],
  ["16", "Anestesia para Procedimentos Fora do Centro Cirúrgico", "R3", "ativo"],
  ["17", "Anestesia para Transplante", "R3", "ativo"],
  ["18", "Anestesia para Urologia", "R2", "ativo"],
  ["19", "Anestesicos Venosos", "R1", "ativo"],
  ["20", "Avaliação e Preparo Pré-Anestésico", "R1", "ativo"],
  ["21", "Bloqueios Periféricos", "R2", "ativo"],
  ["22", "Bloqueios Subaracnóideo e Peridural", "R1", "ativo"],
  ["23", "Choque", "R3", "ativo"],
  ["24", "Complicações da Anestesia", "R1", "ativo"],
  ["25", "Dor", "R3", "ativo"],
  ["26", "Equilíbrio Hidroeletrolítico e Acidobásico", "R2", "ativo"],
  ["27", "Equipamentos", "R1", "ativo"],
  ["28", "Ética Médica e Bioética. Responsabilidade e risco Profissional do Anestesiologista", "R1", "ativo"],
  ["29", "Farmacologia dos Anestésicos Inalatórios", "R1", "ativo"],
  ["30", "Farmacologia dos Anestésicos Locais", "R1", "ativo"],
  ["31", "Farmacologia Geral", "R1", "ativo"],
  ["32", "Fisiologia e Farmacologia do Sistema Cardiocirculatório", "R1", "ativo"],
  ["33", "Fisiologia e Farmacologia do Sistema Respiratório", "R1", "ativo"],
  ["34", "Fisiologia e Farmacologia do Sistema Urinário", "R2", "ativo"],
  ["35", "Gerenciamento do Centro Cirúrgico", "R3", "ativo"],
  ["36", "Hemostasia e Anticoagulação", "R2", "ativo"],
  ["37", "Hipotermia e Hipotensão Arterial Induzida", "R3", "ativo"],
  ["38", "Metodologia Científica", "R2", "ativo"],
  ["39", "Monitorização", "R2", "ativo"],
  ["40", "Organização da SBA, Cooperativismo e SUS", "R1", "ativo"],
  ["41", "Parada Cardíaca e Reanimação", "R1", "inativo"],
  ["42", "Posicionamento", "R1", "ativo"],
  ["43", "Qualidade e Segurança em Anestesia", "R3", "inativo"],
  ["44", "Recuperação Pós-anestésica", "R1", "ativo"],
  ["45", "Reposição Volêmica e Transfusão", "R2", "ativo"],
  ["46", "Sistema Nervoso Central e Autônomo", "R1", "ativo"],
  ["47", "Sistemas de Administração de Anestesia Inalatória", "R2", "ativo"],
  ["48", "Suporte Ventilatorio", "R3", "ativo"],
  ["49", "Transmissão e Bloqueio Neuromuscular", "R1", "ativo"],
  ["50", "Vias Aéreas", "R1", "ativo"],
];

async function ensureLevels() {
  const levelMap = new Map();

  for (const level of LEVELS) {
    const ref = db.collection("catalog_niveis").doc(`nivel_${level.title.toLowerCase()}`);
    const snap = await ref.get();

    await ref.set(
      {
        code: snap.exists ? snap.data()?.code ?? level.code : level.code,
        title: level.title,
        status: "ativo",
        createdAt: snap.exists ? snap.data()?.createdAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    levelMap.set(level.title, ref.id);
  }

  return levelMap;
}

async function seedTemas() {
  const levelMap = await ensureLevels();

  for (const [code, title, levelLabel, status] of TEMAS) {
    const levelId = levelMap.get(levelLabel);
    if (!levelId) {
      throw new Error(`Level not found for ${title}: ${levelLabel}`);
    }

    const ref = db.collection("catalog_temas").doc(`tema_${code.padStart(3, "0")}`);
    const snap = await ref.get();

    await ref.set(
      {
        code,
        title,
        status,
        levelId,
        levelLabel,
        createdAt: snap.exists ? snap.data()?.createdAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
}

seedTemas()
  .then(() => {
    console.log(`Seed concluído: ${TEMAS.length} temas processados.`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
