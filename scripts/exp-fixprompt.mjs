// Restaura enunciados truncados. Uso: node scripts/exp-fixprompt.mjs caminho/lote.json
// Formato: [{ "id": "ENEM2016_Q165", "promptHtml": "<p>...</p>" }, ...]
// O HTML novo SUBSTITUI o texto do enunciado, mas preserva as <img> que já existiam.
import { readFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const sa = require("/Users/davidrangel/Projetos/EnemQuest/.secrets/vinke-74695-firebase-adminsdk-fbsvc-374e2db752.json");
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const file = process.argv[2];
if (!file) {
  console.error("Informe o arquivo JSON do lote.");
  process.exit(1);
}
const itens = JSON.parse(readFileSync(file, "utf8"));
let ok = 0;
for (const item of itens) {
  if (!item.id || !item.promptHtml || !item.promptHtml.includes("<p>")) {
    console.error("Item inválido, pulado:", item.id);
    continue;
  }
  const ref = db.collection("questionsBank").doc(item.id);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error("Não existe:", item.id);
    continue;
  }
  const antigo = snap.data().prompt || "";
  const imgs = (antigo.match(/<p><img[^>]*><\/p>|<img[^>]*>/g) || []).join("");
  const novo = item.promptHtml + imgs;
  await ref.update({
    prompt: novo,
    prompt_text: novo,
    promptRestaurado: "enunciado veio truncado da fonte enem.dev; texto oficial do INEP restaurado",
  });
  ok++;
}
console.log(`Enunciados restaurados: ${ok}/${itens.length} de ${file}`);
process.exit(0);
