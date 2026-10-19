// Importa o ENEM 2025 a partir dos cadernos oficiais do INEP.
//
// Uso: node scripts/enem2025-import.mjs [--dry]
//
// Entrada (produzida por scripts/inep-parse-prova.py e parse_gabarito.py):
//   <DIR>/out_2025_d1.json + out_2025_d1_imgs/   (questões 1-90, 2 línguas)
//   <DIR>/out_2025_d2.json + out_2025_d2_imgs/   (questões 91-180)
//   <DIR>/2025_GB_impresso_D1_CD1.json , _D2_CD11.json
//
// As imagens são recortes em PNG do PDF; aqui elas sobem para o bucket
// vinke-questoes com o nome = sha1 do CONTEÚDO (dedupe automático), do mesmo
// jeito que as questões antigas já referenciam o bucket próprio.
//
// Disciplina/assunto ficam null (exceto língua estrangeira) para o
// classify-questions.mjs resolver depois. Resoluções vêm num passo à parte.

import { readFileSync, existsSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
admin.initializeApp({
  credential: admin.credential.cert(
    require("/Users/davidrangel/Projetos/EnemQuest/.secrets/vinke-74695-firebase-adminsdk-fbsvc-374e2db752.json")
  ),
});
const db = admin.firestore();
const bucket = admin.storage().bucket("vinke-questoes");
const DRY = process.argv.includes("--dry");
// --atualiza: reescreve SÓ o conteúdo (enunciado, alternativas, imagens) de
// questões já existentes, preservando a classificação de disciplina/assunto e
// a resolução. Usado quando o parser do PDF melhora e vale reextrair.
const ATUALIZA = process.argv.includes("--atualiza");
const CAMPOS_CONTEUDO = [
  "prompt", "prompt_text", "options", "correctOptionId", "isActive", "status",
  "internalNote", "imageUrl", "promptImageWidth", "importSource", "imagensMigradas",
  "optionA_text","optionB_text","optionC_text","optionD_text","optionE_text",
  "optionA_imageUrl","optionB_imageUrl","optionC_imageUrl","optionD_imageUrl","optionE_imageUrl",
];

const DIR = "/private/tmp/claude-501/-Users-davidrangel-Projetos-EnemQuest/098ce75e-0fc4-4db5-92cd-83cca59210d5/scratchpad/inep";
const ANO = 2025;

const AREAS = [
  [1, 45, "area-linguagens", "Linguagens, Códigos e suas Tecnologias"],
  [46, 90, "area-humanas", "Ciências Humanas e suas Tecnologias"],
  [91, 135, "area-natureza", "Ciências da Natureza e suas Tecnologias"],
  [136, 180, "area-matematica", "Matemática e suas Tecnologias"],
];
const areaDe = (i) => AREAS.find(([lo, hi]) => i >= lo && i <= hi);

const LINGUA = {
  INGLES: {
    disciplina: "Inglês", disciplinaId: "disc-ingles", level: "Inglês",
    levelId: "disc-ingles", nivel: "Inglês",
    assuntos: ["Interpretação de texto em inglês"],
    assuntoIds: ["ass-ingles-interpretacao-de-texto-em-ingles"],
    themes: ["Interpretação de texto em inglês"],
    themeIds: ["ass-ingles-interpretacao-de-texto-em-ingles"],
  },
  ESPANHOL: {
    disciplina: "Espanhol", disciplinaId: "disc-espanhol", level: "Espanhol",
    levelId: "disc-espanhol", nivel: "Espanhol",
    assuntos: ["Interpretação de texto em espanhol"],
    assuntoIds: ["ass-espanhol-interpretacao-de-texto-em-espanhol"],
    themes: ["Interpretação de texto em espanhol"],
    themeIds: ["ass-espanhol-interpretacao-de-texto-em-espanhol"],
  },
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ─── Imagens: sobem uma vez só, nome = sha1 do conteúdo ──────────────────────
const cacheImg = new Map();
async function subirImagem(dirImgs, arquivo) {
  const chave = `${dirImgs}/${arquivo}`;
  if (cacheImg.has(chave)) return cacheImg.get(chave);
  const buf = readFileSync(chave);
  const hash = createHash("sha1").update(buf).digest("hex");
  const caminho = `questoes/${hash}.png`;
  const url = `https://storage.googleapis.com/vinke-questoes/${caminho}`;
  if (!DRY) {
    const file = bucket.file(caminho);
    const [existe] = await file.exists();
    if (!existe) {
      await file.save(buf, {
        contentType: "image/png",
        metadata: { cacheControl: "public, max-age=31536000, immutable" },
        resumable: false,
      });
      await file.makePublic();
    }
  }
  cacheImg.set(chave, url);
  return url;
}

async function montaHtml(paragrafos, dirImgs) {
  const partes = [];
  for (const p of paragrafos) {
    if (p.tipo === "img") {
      const url = await subirImagem(dirImgs, p.arquivo);
      partes.push(`<p><img src="${url}" alt="" style="max-width:100%"></p>`);
    } else if (p.texto && p.texto.trim()) {
      partes.push(`<p>${esc(p.texto.trim())}</p>`);
    }
  }
  return partes.join("");
}

// ─── Monta um doc ────────────────────────────────────────────────────────────
async function montaDoc(q, idx, sufixo, gabarito, dirImgs) {
  const agora = new Date();
  const letras = ["A", "B", "C", "D", "E"];
  const [, , areaId, areaNome] = areaDe(idx);
  const anulada = gabarito === "Anulado" || !letras.includes(gabarito);

  const prompt = await montaHtml(q.paragrafos, dirImgs);
  const options = [];
  for (const L of letras) {
    const img = (q.alternativasImagem || {})[L];
    const texto = (q.alternativas || {})[L] || "";
    options.push({
      id: L,
      text: img ? "" : esc(texto.trim()),
      imageUrl: img ? await subirImagem(dirImgs, img) : null,
      imageWidth: 100,
    });
  }

  const doc = {
    examId: "enem", examType: "ENEM", prova_tipo: "ENEM",
    examYear: ANO, prova_ano: ANO, enemIndex: idx,
    reference: `ENEM ${ANO} · Questão ${idx}`,
    examSource: `(ENEM-${ANO})`, Prova: `(ENEM-${ANO})`,
    enemLanguage: sufixo ? sufixo.toLowerCase() : null,
    area: areaNome, areaId,
    ...(sufixo
      ? { ...LINGUA[sufixo], classifiedAt: agora, classifiedBy: "importador:enem2025" }
      : { disciplina: null, disciplinaId: null, level: null, levelId: null, nivel: null,
          assuntos: [], assuntoIds: [], themes: [], themeIds: [],
          classifiedAt: null, classifiedBy: null }),
    prompt, prompt_text: prompt,
    imageUrl: null, promptImageWidth: 100,
    options,
    correctOptionId: anulada ? null : gabarito,
    explanation: "", explanationFormat: "html",
    explanationSource: null, explainedBy: null,
    isActive: !anulada,
    status: anulada ? "inativo" : "ativo",
    shuffleOptions: false,
    dificuldade: null, commentAttachments: [],
    internalNote: anulada
      ? `Questão ANULADA pelo INEP no ENEM ${ANO} — importada para manter a prova completa, mas inativa (sem gabarito).`
      : "",
    importSource: "inep:caderno-oficial",
    imagensMigradas: true,          // já nascem no nosso bucket
    createdAt: agora, updatedAt: agora,
  };
  letras.forEach((L, i) => {
    doc[`option${L}_text`] = options[i].text;
    doc[`option${L}_imageUrl`] = options[i].imageUrl;
  });
  return doc;
}

// ─── Main ────────────────────────────────────────────────────────────────────
const d1 = JSON.parse(readFileSync(`${DIR}/out_2025_d1.json`, "utf8"));
const d2 = JSON.parse(readFileSync(`${DIR}/out_2025_d2.json`, "utf8"));
const g1 = JSON.parse(readFileSync(`${DIR}/2025_GB_impresso_D1_CD1.json`, "utf8"));
const g2 = JSON.parse(readFileSync(`${DIR}/2025_GB_impresso_D2_CD11.json`, "utf8"));

const existentes = new Set((await db.collection("questionsBank").select().get()).docs.map((d) => d.id));
const novos = [], avisos = [];

// Dia 1: os 5 primeiros itens são a versão INGLÊS; os 5 seguintes, ESPANHOL.
for (let i = 0; i < d1.length; i++) {
  const q = d1[i];
  const n = q.numero;
  let sufixo = null, gab;
  if (n <= 5) {
    sufixo = i < 5 ? "INGLES" : "ESPANHOL";
    gab = (g1[String(n)] || [])[i < 5 ? 0 : 1];
  } else {
    gab = (g1[String(n)] || [])[0];
  }
  if (!gab) { avisos.push(`Q${n}${sufixo ? "_" + sufixo : ""}: sem gabarito`); continue; }
  const id = `ENEM${ANO}_Q${String(n).padStart(3, "0")}${sufixo ? "_" + sufixo : ""}`;
  if (existentes.has(id) && !ATUALIZA) { avisos.push(`${id}: JÁ EXISTE, pulado`); continue; }
  novos.push({ id, existia: existentes.has(id),
               doc: await montaDoc(q, n, sufixo, gab, `${DIR}/out_2025_d1_imgs`) });
}
// Dia 2
for (const q of d2) {
  const gab = (g2[String(q.numero)] || [])[0];
  if (!gab) { avisos.push(`Q${q.numero}: sem gabarito`); continue; }
  const id = `ENEM${ANO}_Q${String(q.numero).padStart(3, "0")}`;
  if (existentes.has(id) && !ATUALIZA) { avisos.push(`${id}: JÁ EXISTE, pulado`); continue; }
  novos.push({ id, existia: existentes.has(id),
               doc: await montaDoc(q, q.numero, null, gab, `${DIR}/out_2025_d2_imgs`) });
}

// conferências
for (const { id, doc } of novos) {
  if (doc.isActive && !["A","B","C","D","E"].includes(doc.correctOptionId)) avisos.push(`${id}: gabarito inválido`);
  if (doc.options.some((o) => !o.text && !o.imageUrl)) avisos.push(`${id}: alternativa vazia`);
  if (doc.prompt.length < 80) avisos.push(`${id}: enunciado curto (${doc.prompt.length})`);
  if (/\[\[IMG:|ENEM20\d{2}ENEM/.test(doc.prompt)) avisos.push(`${id}: resíduo de extração`);
}

const porArea = {};
novos.forEach(({ doc }) => { porArea[doc.area] = (porArea[doc.area] || 0) + 1; });
console.log(ATUALIZA ? "A atualizar (só conteúdo):" : "A criar:", novos.length);
Object.entries(porArea).forEach(([a, n]) => console.log(`  ${a}: ${n}`));
console.log("  inativas (anuladas):", novos.filter((n) => !n.doc.isActive).map(n=>n.id).join(", ") || "nenhuma");
console.log("  inglês:", novos.filter((n) => n.id.endsWith("_INGLES")).length,
            "| espanhol:", novos.filter((n) => n.id.endsWith("_ESPANHOL")).length);
console.log("  com imagem no enunciado:", novos.filter((n) => n.doc.prompt.includes("<img")).length);
console.log("  com alternativa em imagem:", novos.filter((n) => n.doc.options.some(o=>o.imageUrl)).length);
console.log("  imagens únicas enviadas:", cacheImg.size);
console.log(avisos.length ? "\nAVISOS:" : "\nAVISOS: nenhum");
avisos.forEach((a) => console.log("  -", a));

writeFileSync(`${DIR}/novos2025.json`, JSON.stringify(novos, null, 1));
console.log(`\nprévia em ${DIR}/novos2025.json`);
if (DRY) { console.log("\n[DRY] nada gravado no Firestore (imagens também não subiram)."); process.exit(0); }

for (let i = 0; i < novos.length; i += 400) {
  const b = db.batch();
  novos.slice(i, i + 400).forEach(({ id, doc, existia }) => {
    const ref = db.doc(`questionsBank/${id}`);
    if (existia && ATUALIZA) {
      const patch = { updatedAt: new Date() };
      for (const k of CAMPOS_CONTEUDO) patch[k] = doc[k];
      b.update(ref, patch);                 // preserva disciplina/assunto/resolução
    } else {
      b.set(ref, doc);
    }
  });
  await b.commit();
  console.log(`  ${Math.min(i + 400, novos.length)}/${novos.length} gravadas`);
}
console.log("\nFIM. Próximo: classify-questions.mjs, depois as resoluções.");
process.exit(0);
