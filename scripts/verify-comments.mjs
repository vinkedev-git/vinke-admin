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
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n") }) });
const db = getFirestore();
const ids = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).map((q) => q.id);
const ruins = [];
let ok = 0;
for (const id of ids) {
  const s = await db.collection("questionsBank").doc(id).get();
  if (!s.exists) { ruins.push(`${id}: inexistente`); continue; }
  const d = s.data();
  const txt = String(d.explanation || "").replace(/<[^>]*>/g, "").trim();
  if (!txt) ruins.push(`${id}: sem explanation`);
  else if (/em breve/i.test(txt)) ruins.push(`${id}: ainda com placeholder`);
  else if (!d.reference) ruins.push(`${id}: sem reference`);
  else if (d.explanationSource !== "ia") ruins.push(`${id}: explanationSource=${d.explanationSource}`);
  else if (/—|--|__|–/.test(d.explanation)) ruins.push(`${id}: tracos proibidos`);
  else ok++;
}
console.log(`verificadas: ${ids.length} | ok: ${ok} | problemas: ${ruins.length}`);
ruins.forEach((r) => console.log("  " + r));
process.exit(0);
