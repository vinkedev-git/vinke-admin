// Corrige imagens quebradas/trocadas embutindo o recorte oficial como data URI.
// Uso: node scripts/exp-fiximage.mjs caminho/lote.json
// Formato: [{ "id": "ENEM2023_Q044",
//             "promptImages": ["data:image/jpeg;base64,..."],        // opcional: substitui as <img> do enunciado
//             "optionImages": { "A": "data:image/jpeg;base64,..." }  // opcional: substitui imagem de alternativa
//          }]
import { readFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const sa = require("/Users/davidrangel/Projetos/EnemQuest/.secrets/vinke-74695-firebase-adminsdk-fbsvc-374e2db752.json");
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const MAX_DOC = 900_000; // margem sob o limite de 1 MB do Firestore

const file = process.argv[2];
if (!file) {
  console.error("Informe o arquivo JSON do lote.");
  process.exit(1);
}
const itens = JSON.parse(readFileSync(file, "utf8"));
let ok = 0;
for (const item of itens) {
  const ref = db.collection("questionsBank").doc(item.id);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error("Não existe:", item.id);
    continue;
  }
  const t = snap.data();
  const upd = {};

  if (item.promptImages?.length) {
    const semImg = (t.prompt || "").replace(/<p>\s*<img[^>]*>\s*<\/p>/g, "").replace(/<img[^>]*>/g, "");
    const novas = item.promptImages
      .map((src) => `<p><img src="${src}" alt="" style="max-width:100%"></p>`)
      .join("");
    upd.prompt = semImg + novas;
    upd.prompt_text = upd.prompt;
  }

  if (item.optionImages && Object.keys(item.optionImages).length) {
    upd.options = (t.options || []).map((o) =>
      item.optionImages[o.id] ? { ...o, imageUrl: item.optionImages[o.id] } : o
    );
  }

  if (!Object.keys(upd).length) {
    console.error("Nada a fazer para", item.id);
    continue;
  }
  upd.imagensCorrigidas = "imagem ausente/trocada na fonte enem.dev; recorte oficial do INEP embutido";

  const tamanho = Buffer.byteLength(JSON.stringify({ ...t, ...upd }), "utf8");
  if (tamanho > MAX_DOC) {
    console.error(`PULADO ${item.id}: documento ficaria com ${Math.round(tamanho / 1024)} KB (limite ~900 KB). Comprima mais a imagem.`);
    continue;
  }

  await ref.update(upd);
  ok++;
  console.log(`OK ${item.id} (${Math.round(tamanho / 1024)} KB)`);
}
console.log(`Imagens corrigidas: ${ok}/${itens.length}`);
process.exit(0);
