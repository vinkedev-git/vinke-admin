/**
 * Sobe as figuras da prova TEA 2023 para o Firebase Storage e grava as URLs
 * nas questões (imageUrl do enunciado ou option*_imageUrl das alternativas).
 * Remove também o marcador "[ATENÇÃO: questão contém imagem...]" do prompt.
 *
 * Uso:
 *   node scripts/upload-tea2023-images.mjs --dir=<pasta_das_figuras>          # dry-run
 *   node scripts/upload-tea2023-images.mjs --dir=<pasta_das_figuras> --apply
 */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key]) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
loadEnvFile(path.resolve(process.cwd(), ".env.local"));
loadEnvFile(path.resolve(process.cwd(), ".env"));

function getArg(flag) {
  if (process.argv.includes(flag)) return true;
  const m = process.argv.find((a) => a.startsWith(`${flag}=`));
  return m ? m.slice(flag.length + 1) : null;
}

const apply = Boolean(getArg("--apply"));
const dir = getArg("--dir");
if (!dir) throw new Error("Informe --dir=<pasta com as figuras>");

// arquivo -> destino. campo null = imageUrl do enunciado; letra = option<letra>_imageUrl
const MAP = [
  ["q014.png", "TEA2023_Q014", null],
  ["q016.png", "TEA2023_Q016", null],
  ["q017.png", "TEA2023_Q017", null],
  ["q032.png", "TEA2023_Q032", null],
  ["q036.png", "TEA2023_Q036", null],
  ["q059.png", "TEA2023_Q059", null],
  ["q079.png", "TEA2023_Q079", null],
  ["q080.png", "TEA2023_Q080", null],
  ["q065_A.png", "TEA2023_Q065", "A"],
  ["q065_B.png", "TEA2023_Q065", "B"],
  ["q065_C.png", "TEA2023_Q065", "C"],
  ["q065_D.png", "TEA2023_Q065", "D"],
];

const MARKER = /\s*\[ATEN[ÇC][ÃA]O:[^\]]*\]\s*$/u;

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const bucketName =
  process.env.FIREBASE_STORAGE_BUCKET ||
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
  `${projectId}.firebasestorage.app`;

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
    storageBucket: bucketName,
  });
}
const db = getFirestore();
const bucket = getStorage().bucket(bucketName);

function publicUrl(objectPath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
}

const porQuestao = new Map();
for (const [file, docId, letra] of MAP) {
  const full = path.resolve(dir, file);
  if (!fs.existsSync(full)) throw new Error(`Arquivo não encontrado: ${full}`);
  if (!porQuestao.has(docId)) porQuestao.set(docId, []);
  porQuestao.get(docId).push({ file, full, letra, bytes: fs.statSync(full).size });
}

console.log(`Bucket: ${bucket.name}`);
console.log(`Modo: ${apply ? "APLICAR" : "dry-run"}\n`);

let subidas = 0;
for (const [docId, itens] of porQuestao) {
  const snap = await db.collection("questionsBank").doc(docId).get();
  if (!snap.exists) {
    console.log(`${docId}: DOCUMENTO NÃO ENCONTRADO — pulando`);
    continue;
  }
  const data = snap.data();
  const update = {};

  for (const it of itens) {
    const objectPath = `questionsBank/tea2023/${docId}${it.letra ? `_${it.letra}` : ""}.png`;
    let url = "(dry-run)";
    if (apply) {
      const token = crypto.randomUUID();
      await bucket.upload(it.full, {
        destination: objectPath,
        metadata: {
          contentType: "image/png",
          cacheControl: "public, max-age=31536000",
          metadata: { firebaseStorageDownloadTokens: token },
        },
      });
      url = publicUrl(objectPath, token);
      subidas++;
    }
    if (it.letra) {
      const opts = Array.isArray(data.options) ? [...data.options] : [];
      const idx = opts.findIndex((o) => String(o?.id).toUpperCase() === it.letra);
      if (idx === -1) {
        console.log(`  ${docId}: alternativa ${it.letra} não encontrada — pulando`);
        continue;
      }
      if (apply) {
        opts[idx] = { ...opts[idx], imageUrl: url };
        update.options = opts;
        data.options = opts;
        update[`option${it.letra}_imageUrl`] = url;  // representacao plana espelhada
      }
      console.log(`  ${docId} alternativa ${it.letra} <- ${it.file} (${Math.round(it.bytes / 1024)} KB)`);
    } else {
      if (apply) update.imageUrl = url;
      console.log(`  ${docId} enunciado <- ${it.file} (${Math.round(it.bytes / 1024)} KB)`);
    }
  }

  // limpa o marcador do enunciado (prompt e prompt_text sao espelhados)
  for (const campo of ["prompt", "prompt_text"]) {
    const txt = typeof data?.[campo] === "string" ? data[campo] : "";
    if (MARKER.test(txt)) {
      if (apply) update[campo] = txt.replace(MARKER, "").trim();
      console.log(`  ${docId}: marcador [ATENÇÃO...] removido de ${campo}`);
    }
  }

  if (apply && Object.keys(update).length) {
    await db.collection("questionsBank").doc(docId).update(update);
  }
}

console.log(`\n${apply ? `Concluído. ${subidas} imagens enviadas.` : "Dry-run. Para aplicar, repita com --apply"}`);
process.exit(0);
