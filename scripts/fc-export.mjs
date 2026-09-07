// Exporta insumos por disciplina para a geração de flashcards.
// Para cada disciplina: lista de assuntos (com peso = nº de questões) e
// até 5 exemplos por assunto (enunciado + resolução, truncados).
// Saída: <outDir>/fc-in-<slug>.json

import { writeFileSync, mkdirSync } from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert(
    require("/Users/davidrangel/Projetos/EnemQuest/.secrets/vinke-74695-firebase-adminsdk-fbsvc-374e2db752.json")
  ),
});

const OUT_DIR = "/private/tmp/claude-501/-Users-davidrangel-Projetos-EnemQuest/098ce75e-0fc4-4db5-92cd-83cca59210d5/scratchpad/fc";
mkdirSync(OUT_DIR, { recursive: true });

// disciplina(s) de origem -> { slug do arquivo, título do deck, nº alvo de cards }
const PLANO = [
  { discs: ["Matemática"], slug: "matematica", deck: "Matemática", alvo: 140 },
  { discs: ["Língua Portuguesa"], slug: "portugues", deck: "Língua Portuguesa", alvo: 80 },
  { discs: ["Geografia"], slug: "geografia", deck: "Geografia", alvo: 70 },
  { discs: ["Biologia"], slug: "biologia", deck: "Biologia", alvo: 70 },
  { discs: ["História"], slug: "historia", deck: "História", alvo: 70 },
  { discs: ["Química"], slug: "quimica", deck: "Química", alvo: 65 },
  { discs: ["Física"], slug: "fisica", deck: "Física", alvo: 65 },
  { discs: ["Sociologia"], slug: "sociologia", deck: "Sociologia", alvo: 45 },
  { discs: ["Literatura"], slug: "literatura", deck: "Literatura", alvo: 45 },
  { discs: ["Filosofia"], slug: "filosofia", deck: "Filosofia", alvo: 35 },
  { discs: ["Artes"], slug: "artes", deck: "Artes", alvo: 25 },
  { discs: ["Educação Física"], slug: "edfisica", deck: "Educação Física", alvo: 15 },
  { discs: ["Espanhol", "Inglês"], slug: "linguas", deck: "Línguas Estrangeiras", alvo: 25 },
];

const strip = (s) =>
  String(s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();

async function main() {
  const snap = await admin.firestore().collection("questionsBank").get();
  const docs = snap.docs.filter((d) => d.get("isActive") !== false);

  for (const item of PLANO) {
    const qs = docs.filter((d) => item.discs.includes(d.get("disciplina")));
    const porAssunto = {};
    for (const d of qs) {
      const themes = d.get("themes") || [];
      const assunto = Array.isArray(themes) && themes[0] ? themes[0] : "Geral";
      porAssunto[assunto] ??= { peso: 0, exemplos: [] };
      porAssunto[assunto].peso++;
      if (porAssunto[assunto].exemplos.length < 5) {
        porAssunto[assunto].exemplos.push({
          questionId: d.id,
          enunciado: strip(d.get("prompt_text") || d.get("prompt")).slice(0, 350),
          resolucao: strip(d.get("explanation")).slice(0, 750),
        });
      }
    }
    const assuntos = Object.entries(porAssunto)
      .sort((a, b) => b[1].peso - a[1].peso)
      .map(([nome, v]) => ({ nome, peso: v.peso, exemplos: v.exemplos }));

    const out = { disciplina: item.deck, slug: item.slug, alvoCards: item.alvo, totalQuestoes: qs.length, assuntos };
    writeFileSync(`${OUT_DIR}/fc-in-${item.slug}.json`, JSON.stringify(out, null, 1));
    console.log(`${item.slug}: ${qs.length} questões, ${assuntos.length} assuntos, alvo ${item.alvo} cards`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
