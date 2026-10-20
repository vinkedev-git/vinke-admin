// Reprocessa a REAPLICAÇÃO/PPL a partir dos cadernos do INEP e ATUALIZA as
// questões já importadas, trocando só o CONTEÚDO.
//
// Uso: node scripts/enem-reaplicacao-reparo.mjs [--dry] [--ano=2024]
//
// Por que existe: a primeira importação saiu com quatro defeitos de extração
// (ver enem-reaplicacao-import.mjs). Os três primeiros foram corrigidos no
// parse_prova.py / render_alts.py; este script leva o resultado ao banco.
//   1. a letra da alternativa é DESENHADA duas vezes no caderno, e o glifo
//      repetido reabria a alternativa, zerando o texto já lido;
//   2. a marca d'água "ENEM 2022 ENEM 2022 ..." vazava para o enunciado;
//   3. frações e expoentes das alternativas viravam texto ambíguo — agora
//      essas alternativas são recortadas do PDF como imagem;
//   4. o fim do comando era eleito alternativa A, deslocando o gabarito.
//
// NÃO toca em explanation, disciplina, assuntos, gabarito nem em isActive:
// a regra de publicação (resolução E classificação) continua valendo e é
// decidida fora daqui. Só limpa a marca de reparo das que ficaram boas.
import { readFileSync, existsSync } from "fs";
import { createHash } from "crypto";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.cert(
  require("/Users/davidrangel/Projetos/EnemQuest/.secrets/vinke-74695-firebase-adminsdk-fbsvc-374e2db752.json")) });
const db = admin.firestore();
const bucket = admin.storage().bucket("vinke-questoes");
const DRY = process.argv.includes("--dry");
const SO_ANO = (process.argv.find(a=>a.startsWith("--ano="))||"").split("=")[1];
const BASE = "/private/tmp/claude-501/-Users-davidrangel-Projetos-EnemQuest/098ce75e-0fc4-4db5-92cd-83cca59210d5/scratchpad/inep";
const DIR = `${BASE}/novo`;                 // parse reprocessado
const ANOS = SO_ANO ? [Number(SO_ANO)] : [2020,2022,2023,2024];
const letras = ["A","B","C","D","E"];
const esc = (s)=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

const cacheImg = new Map();
async function subir(dir, arq) {
  const k = `${dir}/${arq}`;
  if (cacheImg.has(k)) return cacheImg.get(k);
  const buf = readFileSync(k);
  const caminho = `questoes/${createHash("sha1").update(buf).digest("hex")}.png`;
  const url = `https://storage.googleapis.com/vinke-questoes/${caminho}`;
  if (!DRY) {
    const f = bucket.file(caminho); const [ex] = await f.exists();
    if (!ex) { await f.save(buf,{contentType:"image/png",
      metadata:{cacheControl:"public, max-age=31536000, immutable"},resumable:false}); await f.makePublic(); }
  }
  cacheImg.set(k,url); return url;
}
async function html(paras, dir) {
  const out = [];
  for (const p of paras) {
    if (p.tipo==="img") out.push(`<p><img src="${await subir(dir,p.arquivo)}" alt="" style="max-width:100%"></p>`);
    else if (p.texto?.trim()) out.push(`<p>${esc(p.texto.trim())}</p>`);
  }
  return out.join("");
}

const atuais = new Map((await db.collection("questionsBank")
  .where("aplicacao","==","reaplicacao-ppl").get()).docs.map(d=>[d.id,d.data()]));
console.log(`reaplicação no banco: ${atuais.size}`);

const updates=[], avisos=[], aindaRuins=[];
let mudouPrompt=0, mudouAlts=0, limpouReparo=0;

for (const ano of ANOS) {
  for (const dia of ["d1","d2"]) {
    const fq=`${DIR}/out_${ano}R_${dia}.json`;
    if (!existsSync(fq)) { avisos.push(`${ano} ${dia}: parse novo ausente`); continue; }
    const qs=JSON.parse(readFileSync(fq,"utf8"));
    const dirImgs=`${DIR}/out_${ano}R_${dia}_imgs`;
    for (let i=0;i<qs.length;i++) {
      const q=qs[i], n=q.numero;
      const sufixo = (dia==="d1" && n<=5) ? (i<5 ? "INGLES" : "ESPANHOL") : null;
      const id = `ENEM${ano}R_Q${String(n).padStart(3,"0")}${sufixo?"_"+sufixo:""}`;
      const atual = atuais.get(id);
      if (!atual) { avisos.push(`${id}: não existe no banco`); continue; }

      const prompt = await html(q.paragrafos, dirImgs);
      if (prompt.length < 80) { avisos.push(`${id}: enunciado curto (${prompt.length}) — PULADA`); continue; }
      if (/\[\[IMG:|ENE[MN]\s?\d{4}\s*ENE/.test(prompt)) { avisos.push(`${id}: resíduo de extração — PULADA`); continue; }

      const options=[];
      for (const L of letras) {
        const img=(q.alternativasImagem||{})[L];
        options.push({ id:L, text: img?"":esc((q.alternativas[L]||"").trim()),
                       imageUrl: img ? await subir(dirImgs,img) : null, imageWidth:100 });
      }
      const incompleta = options.some(o=>!o.text && !o.imageUrl);
      const anulada = !atual.correctOptionId;

      const up = { prompt, prompt_text:prompt, options, updatedAt:new Date() };
      letras.forEach((L,k)=>{ up[`option${L}_text`]=options[k].text; up[`option${L}_imageUrl`]=options[k].imageUrl; });

      if (incompleta) {
        aindaRuins.push(id);
        up.reparoInep = ["alt-faltando"];
        up.internalNote = `REPARO-INEP: mesmo após o reprocessamento do caderno oficial, o parser só `
          + `recupera ${options.filter(o=>o.text||o.imageUrl).length} das 5 alternativas desta questão `
          + `(reaplicação ${ano}, ${dia==="d1"?"dia 1":"dia 2"}, questão ${n}). Precisa de transcrição à mão.`;
        up.isActive = false; up.status = "inativo"; up.aguardandoResolucao = true;
      } else if (!anulada && atual.reparoInep?.length) {
        up.reparoInep = admin.firestore.FieldValue.delete();
        up.internalNote = "";
        limpouReparo++;
      }
      if ((atual.prompt||"") !== prompt) mudouPrompt++;
      const altsAntes = JSON.stringify((atual.options||[]).map(o=>[o.text||"", o.imageUrl||""]));
      const altsDepois = JSON.stringify(options.map(o=>[o.text||"", o.imageUrl||""]));
      if (altsAntes !== altsDepois) mudouAlts++;
      updates.push({id, up});
    }
  }
}

console.log(`\na atualizar: ${updates.length}`);
console.log(`  enunciado mudou .......... ${mudouPrompt}`);
console.log(`  alternativas mudaram ..... ${mudouAlts}`);
console.log(`  marca de reparo limpa .... ${limpouReparo}`);
console.log(`  ainda incompletas ........ ${aindaRuins.length}  ${aindaRuins.join(", ")}`);
console.log(`  imagens tocadas .......... ${cacheImg.size}`);
console.log(avisos.length ? `\nAVISOS (${avisos.length}):` : "\nAVISOS: nenhum");
avisos.slice(0,15).forEach(a=>console.log("  -",a));
if (avisos.length>15) console.log(`  … e mais ${avisos.length-15}`);
if (DRY) { console.log("\n[DRY] nada gravado."); process.exit(0); }
for (let i=0;i<updates.length;i+=400) {
  const b=db.batch();
  updates.slice(i,i+400).forEach(({id,up})=>b.update(db.doc(`questionsBank/${id}`),up));
  await b.commit();
  console.log(`  ${Math.min(i+400,updates.length)}/${updates.length} atualizadas`);
}
console.log("\nFIM.");
process.exit(0);
