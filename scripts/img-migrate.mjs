// Migra imagens externas das questões (enem.dev etc.) para o nosso
// Google Cloud Storage (bucket vinke-questoes), reescrevendo as URLs
// nos documentos do questionsBank.
//
// Uso: node scripts/img-migrate.mjs [--dry]
//
// Desenho:
// - Deduplica por URL (mesma imagem usada em vários campos/questões).
// - Baixa com throttle e retry (a enem.dev aplica rate limit).
// - Faz cache em disco (CACHE_DIR) e salva o mapa url->nova URL em
//   mapping.json ANTES de escrever no Firestore — o processo pode ser
//   reexecutado do ponto em que parou.
// - Reescreve TODAS as ocorrências da URL antiga em campos string do doc
//   e marca imagensMigradas: true (o importador deve pular esses docs).

import { createHash } from "crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert(
    require("/Users/davidrangel/Projetos/EnemQuest/.secrets/vinke-74695-firebase-adminsdk-fbsvc-374e2db752.json")
  ),
});

const DRY = process.argv.includes("--dry");
const db = admin.firestore();
const bucket = admin.storage().bucket("vinke-questoes");

const CACHE_DIR = "/private/tmp/claude-501/-Users-davidrangel-Projetos-EnemQuest/098ce75e-0fc4-4db5-92cd-83cca59210d5/scratchpad/img-cache";
const MAPPING_FILE = `${CACHE_DIR}/mapping.json`;
mkdirSync(CACHE_DIR, { recursive: true });

// .latex na enem.dev é GIF de fórmula; .bmp aparece em provas antigas
const URL_RE = /https?:\/\/[^\s"')<>\\]+\.(?:png|jpe?g|gif|webp|svg|bmp|latex)/gi;

// Citações de fonte impressas no ENUNCIADO (sites mortos há anos) — são
// texto da questão original, não imagens a renderizar. Ficam como estão.
const DEIXAR_COMO_TEXTO = new Set([
  "http://images.quebarato.com.br/photos/big/2/D/15A12D\\_2.jpg",
  "http://images.quebarato.com.br/photos/big/2/D/15A12D_2.jpg",
  "http://www.edmontonculturalcapital.com/gallery/edjazzfestival/JazzQuartet.jpg",
  "http://www.filmica.com/jacintaescudos/archivos/Led-Zeppelin.jpg",
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha1 = (s) => createHash("sha1").update(s).digest("hex");

function extOf(url) {
  const m = url.toLowerCase().match(/\.(png|jpe?g|gif|webp|svg|bmp|latex)(?:$|[?#])/);
  return m ? m[1].replace("jpeg", "jpg") : "png";
}

function contentTypeOf(ext) {
  return {
    png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp",
    svg: "image/svg+xml", bmp: "image/bmp",
    latex: "image/gif", // enem.dev serve GIF com extensão .latex
  }[ext] || "application/octet-stream";
}

function collectUrls(value, out) {
  if (typeof value === "string") {
    for (const u of value.match(URL_RE) || []) out.add(u);
  } else if (Array.isArray(value)) {
    value.forEach((v) => collectUrls(v, out));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((v) => collectUrls(v, out));
  }
}

function rewriteValue(value, mapping) {
  if (typeof value === "string") {
    let s = value;
    for (const [oldUrl, newUrl] of mapping) s = s.split(oldUrl).join(newUrl);
    return s;
  }
  if (Array.isArray(value)) return value.map((v) => rewriteValue(v, mapping));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = rewriteValue(v, mapping);
    return out;
  }
  return value;
}

async function downloadWithRetry(url) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "vinke-img-migrate/1.0" } });
      if (res.status === 429) {
        console.log(`  429 em ${url} — aguardando ${attempt * 15}s`);
        await sleep(attempt * 15000);
        continue;
      }
      if (!res.ok) return { error: `HTTP ${res.status}` };
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) return { error: "vazio" };
      return { buf };
    } catch (e) {
      if (attempt === 5) return { error: e.message };
      await sleep(attempt * 5000);
    }
  }
  return { error: "esgotou tentativas" };
}

async function main() {
  const mapping = existsSync(MAPPING_FILE) ? JSON.parse(readFileSync(MAPPING_FILE, "utf8")) : {};
  const saveMapping = () => writeFileSync(MAPPING_FILE, JSON.stringify(mapping, null, 1));

  console.log("Lendo questionsBank…");
  const snap = await db.collection("questionsBank").get();

  // 1) Levantar URLs de docs ainda não migrados
  const docsToMigrate = [];
  const allUrls = new Set();
  for (const d of snap.docs) {
    // Reexamina TODOS os docs (mesmo já marcados): rodadas anteriores
    // podem ter deixado extensões que o filtro antigo não cobria.
    const urls = new Set();
    collectUrls(d.data(), urls);
    DEIXAR_COMO_TEXTO.forEach((u) => urls.delete(u));
    // ignora o que já aponta para o nosso bucket
    for (const u of [...urls]) if (u.includes("storage.googleapis.com/vinke-questoes")) urls.delete(u);
    if (urls.size) {
      docsToMigrate.push({ ref: d.ref, id: d.id, urls: [...urls] });
      urls.forEach((u) => allUrls.add(u));
    }
  }
  console.log(`Docs a migrar: ${docsToMigrate.length} · URLs únicas: ${allUrls.size}`);
  if (DRY) return;

  // 2) Baixar + subir cada URL única (com cache/mapping para retomar)
  let i = 0;
  const failed = {};
  for (const url of allUrls) {
    i++;
    if (mapping[url]) continue;
    const hash = sha1(url);
    const ext = extOf(url);
    const objectPath = `questoes/${hash}.${ext}`;
    const cachePath = `${CACHE_DIR}/${hash}.${ext}`;

    let buf;
    if (existsSync(cachePath)) {
      buf = readFileSync(cachePath);
    } else {
      const r = await downloadWithRetry(url);
      if (r.error) {
        failed[url] = r.error;
        console.log(`  FALHA ${url}: ${r.error}`);
        continue;
      }
      buf = r.buf;
      writeFileSync(cachePath, buf);
      await sleep(250); // throttle p/ enem.dev
    }

    const file = bucket.file(objectPath);
    await file.save(buf, {
      contentType: contentTypeOf(ext),
      metadata: { cacheControl: "public, max-age=31536000, immutable" },
      resumable: false,
    });
    await file.makePublic();
    mapping[url] = `https://storage.googleapis.com/vinke-questoes/${objectPath}`;
    if (i % 25 === 0) {
      saveMapping();
      console.log(`  ${i}/${allUrls.size} processadas…`);
    }
  }
  saveMapping();
  console.log(`Download/upload concluído. Falhas: ${Object.keys(failed).length}`);
  if (Object.keys(failed).length) writeFileSync(`${CACHE_DIR}/failed.json`, JSON.stringify(failed, null, 1));

  // 3) Reescrever docs cujas URLs foram TODAS migradas
  let rewritten = 0, partial = 0;
  for (const doc of docsToMigrate) {
    const pairs = doc.urls.filter((u) => mapping[u]).map((u) => [u, mapping[u]]);
    if (pairs.length !== doc.urls.length) {
      partial++;
      continue; // não marca migrado enquanto restar URL sem destino
    }
    const snapDoc = await doc.ref.get();
    const newData = rewriteValue(snapDoc.data(), pairs);
    newData.imagensMigradas = true;
    newData.imagensMigradasAt = new Date();
    await doc.ref.set(newData);
    rewritten++;
    if (rewritten % 100 === 0) console.log(`  ${rewritten} docs reescritos…`);
  }
  console.log(`FIM. Docs reescritos: ${rewritten} · incompletos (URL com falha): ${partial}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
