// Busca questões sem resolução e imprime JSON para o fluxo de resoluções em sessão.
// Uso: node scripts/exp-fetch.mjs --limit=40 [--skip=0]
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const sa = require("/Users/davidrangel/Projetos/EnemQuest/.secrets/vinke-74695-firebase-adminsdk-fbsvc-374e2db752.json");
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const arg = (name, def) => {
  const m = process.argv.find((a) => a.startsWith(`--${name}=`));
  return m ? m.split("=")[1] : def;
};
const limit = Number(arg("limit", "40"));
const skip = Number(arg("skip", "0"));

const strip = (html) =>
  (html || "")
    .replace(/<img[^>]*src="([^"]*)"[^>]*>/g, " [IMAGEM: $1] ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const all = await db
  .collection("questionsBank")
  .orderBy(admin.firestore.FieldPath.documentId())
  .get();

const pend = all.docs.filter((d) => !(d.data().explanation || "").trim());
const slice = pend.slice(skip, skip + limit);

const out = slice.map((d) => {
  const t = d.data();
  return {
    id: d.id,
    disciplina: t.disciplina || t.area || "",
    assuntos: t.assuntos || [],
    enunciado: strip(t.prompt).slice(0, 2600),
    alternativas: (t.options || []).map((o) => ({
      id: o.id,
      text: strip(o.text).slice(0, 400) || (o.imageUrl ? `[IMAGEM: ${o.imageUrl}]` : ""),
    })),
    gabarito: t.correctOptionId,
  };
});
console.log(JSON.stringify({ pendentes: pend.length, questoes: out }, null, 1));
process.exit(0);
