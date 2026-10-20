// Importa a REAPLICAÇÃO/PPL do ENEM (2020-2024) dos cadernos oficiais do INEP.
//
// Uso: node scripts/enem-reaplicacao-import.mjs [--dry] [--ano=2024]
//
// A reaplicação é UMA prova por ano (o arquivo se chama PV_reaplicacao_PPL e
// atende tanto quem perdeu a aplicação regular quanto os privados de liberdade).
// É ENEM de verdade, mesma Matriz de Referência — por isso entra misturada aos
// simulados comuns, com a referência dizendo de qual aplicação veio.
//
// IDs: ENEM{ano}R_Q{NNN} (o "R" distingue da prova regular, cujo id já ocupa
// ENEM{ano}_Q{NNN}). A função de slug da LP foi estendida para aceitar o R, de
// modo que /questoes/enem-2024r-questao-137 resolve de volta para o id.

import { readFileSync, existsSync } from "fs";
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
const SO_ANO = (process.argv.find(a=>a.startsWith("--ano="))||"").split("=")[1];
const DIR = "/private/tmp/claude-501/-Users-davidrangel-Projetos-EnemQuest/098ce75e-0fc4-4db5-92cd-83cca59210d5/scratchpad/inep";
// 2021 fica FORA: os PDFs da reaplicação daquele ano têm a codificação de
// texto quebrada (o texto extrai como caracteres de controle em vez de
// letras) em todos os cadernos testados — CD1, CD3 e CD4. Só sairia por OCR.
const ANOS = SO_ANO ? [Number(SO_ANO)] : [2020,2022,2023,2024];

// 2020-2024 seguem a estrutura pós-2017: dia 1 = Linguagens+Humanas (1-90),
// dia 2 = Natureza+Matemática (91-180).
const AREAS = [
  [1, 45, "area-linguagens", "Linguagens, Códigos e suas Tecnologias"],
  [46, 90, "area-humanas", "Ciências Humanas e suas Tecnologias"],
  [91, 135, "area-natureza", "Ciências da Natureza e suas Tecnologias"],
  [136, 180, "area-matematica", "Matemática e suas Tecnologias"],
];
const areaDe = (i) => AREAS.find(([lo, hi]) => i >= lo && i <= hi);
const LING = {
  INGLES: { disciplina:"Inglês", disciplinaId:"disc-ingles", level:"Inglês", levelId:"disc-ingles",
    nivel:"Inglês", assuntos:["Interpretação de texto em inglês"],
    assuntoIds:["ass-ingles-interpretacao-de-texto-em-ingles"],
    themes:["Interpretação de texto em inglês"], themeIds:["ass-ingles-interpretacao-de-texto-em-ingles"] },
  ESPANHOL: { disciplina:"Espanhol", disciplinaId:"disc-espanhol", level:"Espanhol", levelId:"disc-espanhol",
    nivel:"Espanhol", assuntos:["Interpretação de texto em espanhol"],
    assuntoIds:["ass-espanhol-interpretacao-de-texto-em-espanhol"],
    themes:["Interpretação de texto em espanhol"], themeIds:["ass-espanhol-interpretacao-de-texto-em-espanhol"] },
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

const existentes = new Set((await db.collection("questionsBank").select().get()).docs.map(d=>d.id));
const novos=[], avisos=[];
const letras=["A","B","C","D","E"];

for (const ano of ANOS) {
  for (const dia of ["d1","d2"]) {
    const fq=`${DIR}/out_${ano}R_${dia}.json`, fg=`${DIR}/${ano}R_GB_${dia.toUpperCase()}.json`;
    if (!existsSync(fq) || !existsSync(fg)) { avisos.push(`${ano} ${dia}: parse ausente`); continue; }
    const qs=JSON.parse(readFileSync(fq,"utf8"));
    const gb=JSON.parse(readFileSync(fg,"utf8"));
    const dirImgs=`${DIR}/out_${ano}R_${dia}_imgs`;
    for (let i=0;i<qs.length;i++) {
      const q=qs[i];
      const n=q.numero;
      // no dia 1, os 5 primeiros itens são a versão inglês e os 5 seguintes, espanhol
      const sufixo = (dia==="d1" && n<=5) ? (i<5 ? "INGLES" : "ESPANHOL") : null;
      const col = sufixo==="ESPANHOL" ? 1 : 0;
      const gab = (gb[String(n)]||[])[col];
      const id = `ENEM${ano}R_Q${String(n).padStart(3,"0")}${sufixo?"_"+sufixo:""}`;
      if (existentes.has(id)) { avisos.push(`${id}: já existe`); continue; }
      if (!gab) { avisos.push(`${id}: sem gabarito`); continue; }

      const [, , areaId, areaNome] = areaDe(n);
      const prompt = await html(q.paragrafos, dirImgs);
      const options=[];
      for (const L of letras) {
        const img=(q.alternativasImagem||{})[L];
        options.push({ id:L, text: img?"":esc((q.alternativas[L]||"").trim()),
                       imageUrl: img ? await subir(dirImgs,img) : null, imageWidth:100 });
      }
      const anulada = gab==="Anulado" || !letras.includes(gab);
      const incompleta = options.some(o=>!o.text && !o.imageUrl);
      const agora=new Date();
      const nota = anulada
        ? `Questão ANULADA pelo INEP na reaplicação do ENEM ${ano} — importada para manter a prova completa, mas inativa (sem gabarito).`
        : incompleta
          ? `REPARO-INEP: as alternativas desta questão são fórmulas desenhadas no PDF e a letra de cada uma faz parte do desenho, então não foi possível recortá-las uma a uma. A questão está INATIVA porque, sem as alternativas, não é respondível. Reparar à mão a partir do caderno oficial (reaplicação ${ano}, ${dia==="d1"?"dia 1":"dia 2"}, questão ${n}).`
          : "";
      const doc={
        examId:"enem", examType:"ENEM", prova_tipo:"ENEM",
        examYear:ano, prova_ano:ano, enemIndex:n,
        aplicacao:"reaplicacao-ppl",
        reference:`ENEM ${ano} PPL · Questão ${n}`,
        examSource:`(ENEM-${ano}-PPL)`, Prova:`(ENEM-${ano}-PPL)`,
        enemLanguage: sufixo ? sufixo.toLowerCase() : null,
        area:areaNome, areaId,
        ...(sufixo
          ? { ...LING[sufixo], classifiedAt:agora, classifiedBy:"importador:inep-reaplicacao" }
          : { disciplina:null, disciplinaId:null, level:null, levelId:null, nivel:null,
              assuntos:[], assuntoIds:[], themes:[], themeIds:[], classifiedAt:null, classifiedBy:null }),
        prompt, prompt_text:prompt, imageUrl:null, promptImageWidth:100,
        options, correctOptionId: anulada ? null : gab,
        explanation:"", explanationFormat:"html", explanationSource:null, explainedBy:null,
        isActive: !anulada && !incompleta,
        status: (anulada||incompleta) ? "inativo" : "ativo",
        shuffleOptions:false, dificuldade:null, commentAttachments:[],
        internalNote: nota,
        importSource:"inep:caderno-oficial", imagensMigradas:true,
        createdAt:agora, updatedAt:agora,
      };
      letras.forEach((L,k)=>{ doc[`option${L}_text`]=options[k].text; doc[`option${L}_imageUrl`]=options[k].imageUrl; });
      if (prompt.length<80) { avisos.push(`${id}: enunciado curto (${prompt.length})`); continue; }
      if (/\[\[IMG:|ENE[MN]\d{4}ENE/.test(prompt)) { avisos.push(`${id}: resíduo de extração`); continue; }
      novos.push({id, doc});
    }
  }
}

const porAno={}, porArea={};
novos.forEach(({doc})=>{ porAno[doc.examYear]=(porAno[doc.examYear]||0)+1; porArea[doc.area]=(porArea[doc.area]||0)+1; });
console.log("A criar:", novos.length);
console.log("  por ano:", Object.entries(porAno).map(([a,n])=>`${a}:${n}`).join(" "));
Object.entries(porArea).forEach(([a,n])=>console.log(`  ${a}: ${n}`));
console.log("  inativas:", novos.filter(n=>!n.doc.isActive).length,
            "(" + novos.filter(n=>!n.doc.isActive).map(n=>n.id).join(", ") + ")");
console.log("  com imagem no enunciado:", novos.filter(n=>n.doc.prompt.includes("<img")).length);
console.log("  com alternativa em figura:", novos.filter(n=>n.doc.options.some(o=>o.imageUrl)).length);
console.log("  imagens únicas:", cacheImg.size);
console.log(avisos.length?"\nAVISOS:":"\nAVISOS: nenhum"); avisos.slice(0,12).forEach(a=>console.log("  -",a));
if (avisos.length>12) console.log(`  … e mais ${avisos.length-12}`);
if (DRY) { console.log("\n[DRY] nada gravado."); process.exit(0); }
for (let i=0;i<novos.length;i+=400) {
  const b=db.batch();
  novos.slice(i,i+400).forEach(({id,doc})=>b.set(db.doc(`questionsBank/${id}`),doc));
  await b.commit();
  console.log(`  ${Math.min(i+400,novos.length)}/${novos.length} gravadas`);
}
console.log("\nFIM. Próximo: classify-questions.mjs, depois as resoluções.");
process.exit(0);
