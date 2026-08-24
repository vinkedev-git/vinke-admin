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
const apply = process.argv.includes("--apply");
const ids = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).map((q) => q.id);
const alvos = [];
for (const id of ids) {
  const s = await db.collection("questionsBank").doc(id).get();
  if (!s.exists) continue;
  const d = s.data();
  const txts = (d.options || []).map((o) => String(o.text || o.label || "").replace(/<[^>]*>/g, "").trim());
  if (!txts.length) continue;
  // alternativa que e so uma letra isolada, ou que cita "alternativa X" / "opcao X"
  const curtas = txts.filter((t) => /^[A-Ea-e]$/.test(t) || /^(alternativa|op[cç][aã]o|item|figura)\s+[A-E]$/i.test(t));
  if (curtas.length >= 2) {
    alvos.push({ id, txts, shuffle: d.shuffleOptions });
  }
}
console.log(`candidatas: ${alvos.length}`);
for (const a of alvos) {
  console.log(`  ${a.id} shuffleOptions=${a.shuffle} :: ${a.txts.join(" | ")}`);
  if (apply && a.shuffle !== false) await db.collection("questionsBank").doc(a.id).update({ shuffleOptions: false });
}
console.log(apply ? "shuffleOptions desligado nas candidatas." : "dry-run.");
process.exit(0);
