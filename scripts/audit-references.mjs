/**
 * Confere cada citacao "cap. N, Titulo" das referencias contra o sumario real
 * dos PDFs de referencia. Reporta divergencias por livro.
 */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "node:fs"; import path from "node:path";
for (const f of [".env.local", ".env"]) {
  const p = path.resolve(process.cwd(), f); if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i < 0) continue;
    const k = t.slice(0, i).trim(); if (!k || process.env[k]) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
if (!getApps().length) initializeApp({ credential: cert({ projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n") }) });
const db = getFirestore();
const TOC = { miller: JSON.parse(fs.readFileSync("scripts/_toc.json", "utf8")), ...JSON.parse(fs.readFileSync("scripts/_toc2.json", "utf8")) };
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const STOP = new Set(["anesthesia","anestesia","for","and","the","of","in","to","para","de","da","do","dos","das","e","em","anesthetic","care","perioperative","surgery","surgical","management","patient","practice","drugs","physiology","fisiologia"]);
const chave = (s) => new Set(norm(s).split(" ").filter((w) => w.length > 3 && !STOP.has(w)));
const LIVRO = [[/miller/i,"miller"],[/saesp|tratado de anestesiologia/i,"saesp"],[/stoelting/i,"stoelting"],[/guyton/i,"guyton"],[/nysora|peripheral nerve blocks/i,"nysora"],[/estatuto/i,null]];

const snap = await db.collection("questionsBank").where("explanationSource", "==", "ia").get();
const ruins = []; const conf = {};
for (const doc of snap.docs) {
  const ref = String(doc.data().reference || "");
  let livro = null;
  for (const parte of ref.split(";")) {
    for (const [re, nome] of LIVRO) if (re.test(parte)) livro = nome;
    if (!livro || !TOC[livro]) continue;
    const re = /cap(?:\.|ítulo)\s*(\d{1,3})\s*,\s*([^;(]+)/gi;
    let m;
    while ((m = re.exec(parte))) {
      conf[livro] = (conf[livro] || 0) + 1;
      const n = Number(m[1]);
      let titulo = m[2].trim().replace(/\.$/, "").split(/\s+e\s+cap/i)[0].trim();
      const real = TOC[livro][n];
      if (!real) { ruins.push({ id: doc.id, livro, n, titulo, real: "CAPITULO INEXISTENTE" }); continue; }
      const a = chave(titulo), b = chave(real);
      let falta = 0; for (const w of a) if (!b.has(w)) falta++;
      if (a.size && falta) ruins.push({ id: doc.id, livro, n, titulo, real });
    }
  }
}
console.log(`questoes com selo ia: ${snap.size}`);
for (const [l, n] of Object.entries(conf)) console.log(`  ${l}: ${n} citacoes`);
console.log(`\nDIVERGEM: ${ruins.length}\n`);
const agr = {};
for (const r of ruins) { const k = `[${r.livro}] cap. ${r.n}, "${r.titulo}"  ==>  REAL = "${r.real}"`; (agr[k] = agr[k] || []).push(r.id); }
for (const [k, ids] of Object.entries(agr).sort((a, b) => b[1].length - a[1].length))
  console.log(`[${String(ids.length).padStart(3)}x] ${k}\n        ${ids.slice(0, 14).join(", ")}${ids.length > 14 ? " ..." : ""}`);
process.exit(0);
