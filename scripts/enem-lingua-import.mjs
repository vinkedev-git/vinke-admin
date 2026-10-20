// Importa as questões de LÍNGUA ESTRANGEIRA que faltavam em anos antigos.
//
// Uso: node scripts/enem-lingua-import.mjs [--dry]
//
// Cada prova do ENEM tem 5 questões de língua estrangeira em duas versões
// (inglês e espanhol) e o aluno escolhe uma. A fonte api.enem.dev entregou só
// parte delas, deixando buracos: 2011 ficou com 1 espanhol de 5, e 2012, 2015,
// 2016, 2019 e 2020 perderam uma cada.
//
// ATENÇÃO À ESTRUTURA POR ANO: até 2016 Linguagens era no DIA 2 e as questões
// de língua são a 91-95; de 2017 em diante é no DIA 1 e são a 1-5. O caderno
// traz as duas línguas em sequência (inglês primeiro), e o gabarito oficial
// tem uma coluna para cada.

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

const LING = {
  INGLES: { disciplina:"Inglês", disciplinaId:"disc-ingles", level:"Inglês",
    levelId:"disc-ingles", nivel:"Inglês",
    assuntos:["Interpretação de texto em inglês"],
    assuntoIds:["ass-ingles-interpretacao-de-texto-em-ingles"],
    themes:["Interpretação de texto em inglês"],
    themeIds:["ass-ingles-interpretacao-de-texto-em-ingles"] },
  ESPANHOL: { disciplina:"Espanhol", disciplinaId:"disc-espanhol", level:"Espanhol",
    levelId:"disc-espanhol", nivel:"Espanhol",
    assuntos:["Interpretação de texto em espanhol"],
    assuntoIds:["ass-espanhol-interpretacao-de-texto-em-espanhol"],
    themes:["Interpretação de texto em espanhol"],
    themeIds:["ass-espanhol-interpretacao-de-texto-em-espanhol"] },
};
const esc=(s)=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

const cacheImg = new Map();
async function subir(dir, arq) {
  const k=`${dir}/${arq}`;
  if (cacheImg.has(k)) return cacheImg.get(k);
  const buf=readFileSync(k);
  const caminho=`questoes/${createHash("sha1").update(buf).digest("hex")}.png`;
  const url=`https://storage.googleapis.com/vinke-questoes/${caminho}`;
  if (!DRY) {
    const f=bucket.file(caminho); const [ex]=await f.exists();
    if (!ex) { await f.save(buf,{contentType:"image/png",
      metadata:{cacheControl:"public, max-age=31536000, immutable"},resumable:false}); await f.makePublic(); }
  }
  cacheImg.set(k,url); return url;
}
async function html(paras, dir) {
  const out=[];
  for (const p of paras) {
    if (p.tipo==="img") out.push(`<p><img src="${await subir(dir,p.arquivo)}" alt="" style="max-width:100%"></p>`);
    else if (p.texto?.trim()) out.push(`<p>${esc(p.texto.trim())}</p>`);
  }
  return out.join("");
}

const faltantes = JSON.parse(readFileSync(`${DIR}/faltantes.json`,"utf8"));
const snap = await db.collection("questionsBank").select().get();
const existentes = new Set(snap.docs.map(d=>d.id));
const novos=[], avisos=[], conferencias=[];

for (const f of faltantes) {
  const qs = JSON.parse(readFileSync(`${DIR}/out_${f.ano}_${f.dia}.json`,"utf8"));
  const gb = JSON.parse(readFileSync(`${DIR}/${f.ano}_GB_${f.dia.toUpperCase()}.json`,"utf8"));
  const ini = f.dia==="d1" ? 1 : 91;
  const lin = qs.filter(q=>q.numero>=ini && q.numero<=ini+4);
  const q = lin[f.idx];
  if (!q || q.numero!==f.numero) { avisos.push(`${f.ano} q${f.numero}: item não confere no parse`); continue; }
  const sufixo = f.lingua==="Inglês" ? "INGLES" : "ESPANHOL";
  const col = sufixo==="INGLES" ? 0 : 1;
  const gab = (gb[String(f.numero)]||[])[col];
  if (!gab) { avisos.push(`${f.ano} q${f.numero} ${sufixo}: sem gabarito`); continue; }
  // A numeração do nosso banco NÃO é de um caderno só: para estes anos a fonte
  // original trouxe inglês e espanhol de cadernos diferentes (em 2016 a nossa
  // Q091_INGLES é a q93 do amarelo, enquanto a Q091_ESPANHOL é a q91). Então o
  // número do caderno não serve de id — usamos a primeira VAGA livre da faixa e
  // guardamos o número real do caderno na nota interna.
  let id = null, slot = null;
  const livre = (c) => !existentes.has(c) && !novos.some(x=>x.id===c);
  const preferido = `ENEM${f.ano}_Q${String(f.numero).padStart(3,"0")}_${sufixo}`;
  if (livre(preferido)) { id = preferido; slot = f.numero; }
  for (let n2 = ini; !id && n2 <= ini + 4; n2++) {
    const cand = `ENEM${f.ano}_Q${String(n2).padStart(3,"0")}_${sufixo}`;
    if (livre(cand)) { id = cand; slot = n2; }
  }
  if (!id) { avisos.push(`${f.ano} q${f.numero} ${sufixo}: sem vaga livre na faixa`); continue; }

  const dirImgs = `${DIR}/out_${f.ano}_${f.dia}_imgs`;
  const prompt = await html(q.paragrafos, dirImgs);
  const letras=["A","B","C","D","E"];
  const options=[];
  for (const L of letras) {
    const img=(q.alternativasImagem||{})[L];
    options.push({ id:L, text: img?"":esc((q.alternativas[L]||"").trim()),
                   imageUrl: img ? await subir(dirImgs,img) : null, imageWidth:100 });
  }
  if (options.some(o=>!o.text && !o.imageUrl)) { avisos.push(`${id}: alternativa vazia`); continue; }
  if (prompt.length < 80) { avisos.push(`${id}: enunciado curto (${prompt.length})`); continue; }

  const agora=new Date();
  const doc={
    examId:"enem", examType:"ENEM", prova_tipo:"ENEM",
    examYear:f.ano, prova_ano:f.ano, enemIndex:slot,
    reference:`ENEM ${f.ano} · Questão ${slot}`,
    enemIndexCaderno:f.numero,
    examSource:`(ENEM-${f.ano})`, Prova:`(ENEM-${f.ano})`,
    enemLanguage: sufixo.toLowerCase(),
    area:"Linguagens, Códigos e suas Tecnologias", areaId:"area-linguagens",
    ...LING[sufixo], classifiedAt:agora, classifiedBy:"importador:inep-lingua",
    prompt, prompt_text:prompt, imageUrl:null, promptImageWidth:100,
    options, correctOptionId:gab,
    explanation:"", explanationFormat:"html", explanationSource:null, explainedBy:null,
    isActive:true, status:"ativo", shuffleOptions:false,
    dificuldade:null, commentAttachments:[],
    internalNote:`Importada do caderno oficial do INEP (ENEM ${f.ano}, ${f.dia==="d1"?"dia 1 caderno 1 azul":"dia 2 caderno 5 amarelo"}, questão ${f.numero}). Nesta base a numeração destes anos mistura cadernos — inglês e espanhol vieram de cadernos diferentes na fonte original —, então esta questão ocupa a vaga ${slot}, que estava livre. O número original do caderno fica em enemIndexCaderno.`,
    importSource:"inep:caderno-oficial", imagensMigradas:true,
    createdAt:agora, updatedAt:agora,
  };
  letras.forEach((L,i)=>{ doc[`option${L}_text`]=options[i].text; doc[`option${L}_imageUrl`]=options[i].imageUrl; });
  novos.push({id, doc, texto:(q.paragrafos.find(p=>p.tipo==="p")?.texto||"").slice(0,52)});
}

// Conferência cruzada: o gabarito de inglês que JÁ temos tem de bater com a 1ª coluna
for (const ano of [...new Set(faltantes.map(f=>f.ano))]) {
  const dia = faltantes.find(f=>f.ano===ano).dia;
  const gb = JSON.parse(readFileSync(`${DIR}/${ano}_GB_${dia.toUpperCase()}.json`,"utf8"));
  const ini = dia==="d1" ? 1 : 91;
  for (let n=ini; n<=ini+4; n++) {
    const d=(await db.doc(`questionsBank/ENEM${ano}_Q${String(n).padStart(3,"0")}_INGLES`).get());
    if (!d.exists) continue;
    const nosso=d.data().correctOptionId, oficial=(gb[String(n)]||[])[0];
    conferencias.push(`${ano} q${n} inglês: banco ${nosso} vs oficial ${oficial} ${nosso===oficial?"OK":"DIVERGE"}`);
  }
}

console.log("A criar:", novos.length);
novos.forEach(n=>console.log(`   ${n.id} (gab ${n.doc.correctOptionId}) ${n.texto}`));
console.log("\nconferência cruzada do gabarito de inglês já existente:");
conferencias.forEach(c=>console.log("  ", c));
console.log("\nimagens:", cacheImg.size);
console.log(avisos.length?"\nAVISOS:":"\nAVISOS: nenhum"); avisos.forEach(a=>console.log("  -",a));
if (DRY) { console.log("\n[DRY] nada gravado."); process.exit(0); }
const b=db.batch();
novos.forEach(n=>b.set(db.doc(`questionsBank/${n.id}`), n.doc));
await b.commit();
console.log(`\nGravadas ${novos.length} questões (sem resolução ainda).`);
process.exit(0);
