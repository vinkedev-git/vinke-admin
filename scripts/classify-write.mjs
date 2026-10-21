// Grava classificações produzidas FORA do classificador por API.
//
// Uso: node scripts/classify-write.mjs <dir> [--dry]
//
// Existe porque o classify-questions.mjs depende da API da Anthropic, e com a
// chave sem crédito as questões ficavam represadas sem disciplina — portanto
// inativas, porque a regra de publicação exige resolução E classificação.
// Aqui a classificação vem de arquivos {id, disciplinaId, assunto} e a
// gravação repete exatamente o que o classificador faria: resolve o assunto
// pelo nome normalizado dentro da disciplina e, se não existir, cria o nó na
// taxonomia com o mesmo padrão de id.
import { readFileSync, readdirSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.cert(
  require("/Users/davidrangel/Projetos/EnemQuest/.secrets/vinke-74695-firebase-adminsdk-fbsvc-374e2db752.json")) });
const db = admin.firestore();
const DIR = process.argv[2];
const DRY = process.argv.includes("--dry");
if (!DIR) { console.error("uso: classify-write.mjs <dir> [--dry]"); process.exit(1); }

const slug = (v) => String(v).toLowerCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const norm = (v) => String(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const nodes = (await db.collection("taxonomia").get()).docs.map(d=>({id:d.id,...d.data()}));
const areas = new Map(nodes.filter(n=>n.tipo==="area").map(n=>[n.id,n]));
const discById = new Map(nodes.filter(n=>n.tipo==="disciplina" && n.ativo!==false).map(d=>[d.id,d]));
const assPorDisc = new Map();
for (const a of nodes.filter(n=>n.tipo==="assunto" && n.ativo!==false)) {
  const l = assPorDisc.get(a.disciplinaId) ?? []; l.push(a); assPorDisc.set(a.disciplinaId, l);
}

const entradas = new Map();
for (const f of readdirSync(DIR).filter(f=>f.endsWith("-in.json")))
  for (const q of JSON.parse(readFileSync(`${DIR}/${f}`,"utf8"))) entradas.set(q.id, q);

const classif = [];
const erros = [];
for (const f of readdirSync(DIR).filter(f=>f.endsWith("-out.json")).sort()) {
  let arr;
  try { arr = JSON.parse(readFileSync(`${DIR}/${f}`,"utf8")); }
  catch (e) { erros.push(`${f}: JSON inválido — ${e.message}`); continue; }
  const esperado = JSON.parse(readFileSync(`${DIR}/${f.replace("-out","-in")}`,"utf8"));
  if (arr.length !== esperado.length) { erros.push(`${f}: ${arr.length} itens, esperado ${esperado.length}`); continue; }
  arr.forEach((c, i) => {
    const q = esperado[i];
    if (c.id !== q.id) { erros.push(`${f}[${i}]: id ${c.id} != ${q.id}`); return; }
    const disc = discById.get(c.disciplinaId);
    if (!disc) { erros.push(`${c.id}: disciplinaId inexistente (${c.disciplinaId})`); return; }
    if (disc.areaId !== q.areaId) {
      erros.push(`${c.id}: ${c.disciplinaId} é da área ${disc.areaId}, questão é ${q.areaId}`); return; }
    const a = String(c.assunto||"").trim();
    if (!a || a.length > 45) { erros.push(`${c.id}: assunto inválido (${JSON.stringify(c.assunto)})`); return; }
    classif.push({ id: c.id, disc, assunto: a });
  });
}
console.log(`lotes lidos: ${readdirSync(DIR).filter(f=>f.endsWith("-out.json")).length}`);
console.log(`classificações válidas: ${classif.length} · erros: ${erros.length}`);
erros.slice(0,25).forEach(e=>console.log("  -",e));
if (erros.length>25) console.log(`  … e mais ${erros.length-25}`);
if (erros.length) { console.log("\nABORTADO: corrija os erros antes de gravar."); process.exit(1); }

const novos = [];
let reaproveitados = 0;
const resolvidos = classif.map(c => {
  const existentes = assPorDisc.get(c.disc.id) ?? [];
  let doc = existentes.find(a => norm(a.nome) === norm(c.assunto));
  if (!doc) {
    const id = `ass-${c.disc.id.replace(/^disc-/,"")}-${slug(c.assunto)}`;
    doc = { id, tipo:"assunto", nome:c.assunto, areaId:c.disc.areaId,
            disciplinaId:c.disc.id, ordem:999, ativo:true };
    existentes.push(doc); assPorDisc.set(c.disc.id, existentes); novos.push(doc);
  } else reaproveitados++;
  return { ...c, assuntoDoc: doc };
});
const porDisc = {};
resolvidos.forEach(c=>{porDisc[c.disc.nome]=(porDisc[c.disc.nome]||0)+1;});
console.log("\npor disciplina:", Object.entries(porDisc).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${v}`).join(" "));
console.log(`assuntos reaproveitados: ${reaproveitados} · novos: ${novos.length}`);
novos.forEach(n=>console.log(`   + ${n.disciplinaId} / ${n.nome}`));
if (DRY) { console.log("\n[DRY] nada gravado."); process.exit(0); }

for (let i=0;i<novos.length;i+=400) {
  const b = db.batch();
  novos.slice(i,i+400).forEach(n=>b.set(db.collection("taxonomia").doc(n.id),
    {...n, createdAt:new Date(), updatedAt:new Date(), createdBy:"classificador-subagente"}, {merge:true}));
  await b.commit();
}
console.log(`taxonomia: ${novos.length} assuntos criados`);
for (let i=0;i<resolvidos.length;i+=400) {
  const b = db.batch();
  resolvidos.slice(i,i+400).forEach(c=>b.set(db.collection("questionsBank").doc(c.id), {
    disciplinaId:c.disc.id, disciplina:c.disc.nome,
    levelId:c.disc.id, level:c.disc.nome, nivel:c.disc.nome,
    areaId:c.disc.areaId, area: areas.get(c.disc.areaId)?.nome ?? null,
    assuntoIds:[c.assuntoDoc.id], assuntos:[c.assuntoDoc.nome],
    themes:[c.assuntoDoc.nome], themeIds:[c.assuntoDoc.id],
    classifiedBy:"subagente:sonnet", classifiedAt:new Date(), updatedAt:new Date(),
  }, {merge:true}));
  await b.commit();
  console.log(`  ${Math.min(i+400,resolvidos.length)}/${resolvidos.length} classificadas`);
}
console.log("\nFIM.");
process.exit(0);
