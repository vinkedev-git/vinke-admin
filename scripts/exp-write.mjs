// Grava resoluções geradas em sessão. Uso: node scripts/exp-write.mjs caminho/lote.json
// Formato do JSON: [{ "id": "ENEM2019_Q001", "html": "<p>...</p>" }, ...]
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
  if (!item.id || !item.html || !item.html.includes("<p>")) {
    console.error("Item inválido, pulado:", item.id);
    continue;
  }
  await db.collection("questionsBank").doc(item.id).update({
    explanation: item.html,
    explanationFormat: "html",
    explanationSource: "ia",
    explainedBy: "claude-fable-5:sessao",
  });
  ok++;
}
console.log(`Gravadas ${ok}/${itens.length} resoluções de ${file}`);
process.exit(0);
