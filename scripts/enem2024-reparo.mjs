// Repara questões do ENEM 2024 contra os cadernos OFICIAIS do INEP e importa
// o espanhol, que faltava.
//
// Uso: node scripts/enem2024-reparo.mjs [--dry]
//
// Por que: o ENEM 2024 entrou pelo dataset da Maritaca, que usa o caderno de
// acessibilidade (laranja). Dali vieram três problemas — comando lido como
// alternativa, crônica abreviada e "matemática falada" ("fração, numerador 7
// fatorial…" em vez de 7!/4!). O caderno regular do INEP não tem nada disso.
//
// ATENÇÃO À NUMERAÇÃO: o caderno regular é outro (azul/CD5) e as questões
// estão em ORDEM DIFERENTE — 88 das 122 primeiras conferidas mudam de número.
// Por isso o casamento é por CONTEÚDO (mapa2024.json) e o gabarito vem do
// gabarito DAQUELE caderno, nunca da letra que já estava no banco.

import { readFileSync, writeFileSync } from "fs";
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
const DIR = "/private/tmp/claude-501/-Users-davidrangel-Projetos-EnemQuest/098ce75e-0fc4-4db5-92cd-83cca59210d5/scratchpad/inep";

// Questões a trocar pelo conteúdo do caderno regular. Ficaram DE FORA
// Q145, Q160, Q164 e Q165: nelas as letras das alternativas fazem parte do
// desenho da fórmula e não dá para recortá-las uma a uma com confiança.
const REPARAR = ["ENEM2024_Q009","ENEM2024_Q013","ENEM2024_Q033",
                 "ENEM2024_Q119","ENEM2024_Q145","ENEM2024_Q146",
                 "ENEM2024_Q154","ENEM2024_Q169","ENEM2024_Q172"];

const ESP = {
  disciplina:"Espanhol", disciplinaId:"disc-espanhol", level:"Espanhol",
  levelId:"disc-espanhol", nivel:"Espanhol",
  assuntos:["Interpretação de texto em espanhol"],
  assuntoIds:["ass-espanhol-interpretacao-de-texto-em-espanhol"],
  themes:["Interpretação de texto em espanhol"],
  themeIds:["ass-espanhol-interpretacao-de-texto-em-espanhol"],
};
const esc=(s)=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

const cacheImg = new Map();
async function subir(dirImgs, arquivo) {
  const chave = `${dirImgs}/${arquivo}`;
  if (cacheImg.has(chave)) return cacheImg.get(chave);
  const buf = readFileSync(chave);
  const hash = createHash("sha1").update(buf).digest("hex");
  const caminho = `questoes/${hash}.png`;
  const url = `https://storage.googleapis.com/vinke-questoes/${caminho}`;
  if (!DRY) {
    const f = bucket.file(caminho);
    const [existe] = await f.exists();
    if (!existe) {
      await f.save(buf, { contentType:"image/png",
        metadata:{ cacheControl:"public, max-age=31536000, immutable" }, resumable:false });
      await f.makePublic();
    }
  }
  cacheImg.set(chave, url);
  return url;
}
async function html(paragrafos, dirImgs) {
  const out = [];
  for (const p of paragrafos) {
    if (p.tipo === "img") out.push(`<p><img src="${await subir(dirImgs,p.arquivo)}" alt="" style="max-width:100%"></p>`);
    else if (p.texto?.trim()) out.push(`<p>${esc(p.texto.trim())}</p>`);
  }
  return out.join("");
}
async function opcoes(q, dirImgs) {
  const letras = ["A","B","C","D","E"], out = [];
  for (const L of letras) {
    const img = (q.alternativasImagem||{})[L];
    out.push({ id:L, text: img ? "" : esc((q.alternativas[L]||"").trim()),
               imageUrl: img ? await subir(dirImgs,img) : null, imageWidth:100 });
  }
  return out;
}

// ─── carrega ────────────────────────────────────────────────────────────────
const mapa = JSON.parse(readFileSync(`${DIR}/mapa2024.json`,"utf8"));
const d1 = JSON.parse(readFileSync(`${DIR}/out_2024_d1.json`,"utf8"));
const d2 = JSON.parse(readFileSync(`${DIR}/out_2024_d2.json`,"utf8"));
const g1 = JSON.parse(readFileSync(`${DIR}/2024_GB_impresso_D1_CD1.json`,"utf8"));
const g2 = JSON.parse(readFileSync(`${DIR}/2024_GB_impresso_D2_CD5.json`,"utf8"));
const IMG1 = `${DIR}/out_2024_d1_imgs`, IMG2 = `${DIR}/out_2024_d2_imgs`;
// os 5 primeiros itens do dia 1 são inglês; os 5 seguintes, espanhol
d1.forEach((q,i)=>{ if (q.numero<=5) q._lingua = i<5 ? "INGLES" : "ESPANHOL"; });

const acheD1 = (n, lingua) => d1.find(q => q.numero===n && (q._lingua||null)===(lingua||null));
const acheD2 = (n) => d2.find(q => q.numero===n);

const avisos = [], ops = [];

// ─── 1) reparos ─────────────────────────────────────────────────────────────
for (const id of REPARAR) {
  const m = mapa.find(x => x.banco === id);
  if (!m) { avisos.push(`${id}: sem entrada no mapa`); continue; }
  const q = m.dia===1 ? acheD1(m.inep, m.lingua) : acheD2(m.inep);
  const dirImgs = m.dia===1 ? IMG1 : IMG2;
  const gab = (m.dia===1 ? g1 : g2)[String(m.inep)]?.[0];
  if (!q || !gab) { avisos.push(`${id}: questão ou gabarito ausente (dia ${m.dia} q${m.inep})`); continue; }
  const atual = (await db.doc(`questionsBank/${id}`).get()).data();
  const prompt = await html(q.paragrafos, dirImgs);
  const options = await opcoes(q, dirImgs);
  if (options.some(o=>!o.text && !o.imageUrl)) { avisos.push(`${id}: alternativa vazia após reparo, PULADO`); continue; }
  // confere se o conteúdo da resposta certa continua o mesmo
  const antes = (atual.options||[]).find(o=>o.id===atual.correctOptionId);
  const depois = options.find(o=>o.id===gab);
  ops.push({ id, patch: {
      prompt, prompt_text: prompt, options,
      correctOptionId: gab,
      explanation: "", explanationSource: null, explainedBy: null,   // refazer
      isActive: true, status: "ativo",
      internalNote: `Reparado em 19/10/2026 contra o caderno oficial do INEP (dia ${m.dia}, questão ${m.inep} do caderno regular). O conteúdo anterior vinha do caderno de acessibilidade e tinha defeito. Gabarito tomado do gabarito oficial desse caderno.`,
      importSource: "inep:caderno-oficial", imagensMigradas: true,
      updatedAt: new Date(),
    },
    diag: `${id} <- dia${m.dia} q${m.inep} | gab ${atual.correctOptionId}->${gab} | antes: ${(antes?.text||"[img]").slice(0,34)} | depois: ${(depois?.text||"[img]").slice(0,34)}`,
  });
}

// ─── 2) espanhol de 2024 (não existia no banco) ─────────────────────────────
const novos = [];
for (let n=1; n<=5; n++) {
  const q = acheD1(n, "ESPANHOL");
  const gab = g1[String(n)]?.[1];      // 2ª coluna do gabarito = espanhol
  const id = `ENEM2024_Q${String(n).padStart(3,"0")}_ESPANHOL`;
  if (!q || !gab) { avisos.push(`${id}: faltou questão ou gabarito`); continue; }
  if ((await db.doc(`questionsBank/${id}`).get()).exists) { avisos.push(`${id}: já existe`); continue; }
  const prompt = await html(q.paragrafos, IMG1);
  const options = await opcoes(q, IMG1);
  const agora = new Date();
  const doc = {
    examId:"enem", examType:"ENEM", prova_tipo:"ENEM",
    examYear:2024, prova_ano:2024, enemIndex:n,
    reference:`ENEM 2024 · Questão ${n}`, examSource:"(ENEM-2024)", Prova:"(ENEM-2024)",
    enemLanguage:"espanhol",
    area:"Linguagens, Códigos e suas Tecnologias", areaId:"area-linguagens",
    ...ESP, classifiedAt:agora, classifiedBy:"importador:inep-2024-espanhol",
    prompt, prompt_text:prompt, imageUrl:null, promptImageWidth:100,
    options, correctOptionId:gab,
    explanation:"", explanationFormat:"html", explanationSource:null, explainedBy:null,
    isActive:true, status:"ativo", shuffleOptions:false,
    dificuldade:null, commentAttachments:[], internalNote:"",
    importSource:"inep:caderno-oficial", imagensMigradas:true,
    createdAt:agora, updatedAt:agora,
  };
  letrasFill(doc, options);
  novos.push({ id, doc });
}
function letrasFill(doc, options) {
  ["A","B","C","D","E"].forEach((L,i)=>{ doc[`option${L}_text`]=options[i].text; doc[`option${L}_imageUrl`]=options[i].imageUrl; });
}

console.log("REPAROS:", ops.length);
ops.forEach(o=>console.log("  ", o.diag));
console.log("\nESPANHOL a criar:", novos.length, novos.map(n=>`${n.id}(gab ${n.doc.correctOptionId})`).join(" "));
console.log("\nimagens enviadas:", cacheImg.size);
console.log(avisos.length ? "\nAVISOS:" : "\nAVISOS: nenhum");
avisos.forEach(a=>console.log("  -", a));
if (DRY) { console.log("\n[DRY] nada gravado."); process.exit(0); }

const b = db.batch();
ops.forEach(o => b.update(db.doc(`questionsBank/${o.id}`), o.patch));
novos.forEach(n => { letrasFill(n.doc, n.doc.options); b.set(db.doc(`questionsBank/${n.id}`), n.doc); });
await b.commit();
console.log(`\nGravado: ${ops.length} reparadas + ${novos.length} criadas. As reparadas ficaram SEM resolução (precisam ser refeitas).`);
process.exit(0);
