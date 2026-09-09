// Mapeia resíduos de conversão da fonte enem.dev em prompt/prompt_text/options[].text:
//  - ênfase markdown literal (_x_, *x*, **x**)
//  - notação matemática duplicada LaTeX+unicode (ex.: 10^{-8}10​−8 com zero-width spaces)
// Uso: node scripts/exp-scan-residuos.mjs [--id=ENEM2019_Q137] [--samples=5]
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const sa = require("/Users/davidrangel/Projetos/EnemQuest/.secrets/vinke-74695-firebase-adminsdk-fbsvc-374e2db752.json");
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const arg = (name, def) => {
  const m = process.argv.find((a) => a.startsWith(`--${name}=`));
  return m ? m.split("=")[1] : def;
};
const onlyId = arg("id", "");
const nSamples = Number(arg("samples", "5"));

const vis = (s) =>
  s
    .replace(/​/g, "⟨ZWSP⟩")
    .replace(/‌/g, "⟨ZWNJ⟩")
    .replace(/−/g, "⟨MINUS⟩")
    .replace(/⁤/g, "⟨INVPLUS⟩");

// Padrões investigados
const PATTERNS = {
  // _itálico_ literal (fora de tag html), evitando snake_case e URLs
  underscoreEm: /(^|[\s>(["'])_[^_<>\n]{1,80}_(?=[\s<).,;:!?"']|$)/g,
  asteriskBold: /\*\*[^*<>\n]{1,80}\*\*/g,
  asteriskEm: /(^|[\s>(["'])\*[^*<>\n]{1,80}\*(?=[\s<).,;:!?"']|$)/g,
  // ^{...} LaTeX sobrando
  caretBrace: /\^\{[^}]{1,20}\}/g,
  // subscrito LaTeX
  underBrace: /_\{[^}]{1,20}\}/g,
  // zero-width space (marca da duplicação unicode)
  zwsp: /​/g,
  // sequência dígitos + ^{..} imediatamente seguida de dígitos/unicode (duplicação)
  dupExp: /\d+\s*\^\{[^}]{1,20}\}[​⁤]*[\d−⁻⁰-⁹⁰¹²³⁴⁵⁶⁷⁸⁹]/g,
  // \x comandos latex
  latexCmd: /\\(frac|times|cdot|text|mathrm|sqrt|left|right)/g,
  // entidades duplas ou markdown de link
  mdLink: /\[[^\]]{1,80}\]\([^)]{1,200}\)/g,
};

const fields = (t) => {
  const list = [["prompt", t.prompt || ""], ["prompt_text", t.prompt_text || ""]];
  (t.options || []).forEach((o, i) => list.push([`options[${o.id ?? i}].text`, o.text || ""]));
  return list;
};

if (onlyId) {
  const snap = await db.collection("questionsBank").doc(onlyId).get();
  if (!snap.exists) { console.error("Não existe:", onlyId); process.exit(1); }
  const t = snap.data();
  for (const [name, val] of fields(t)) {
    console.log(`\n===== ${name} =====`);
    console.log(vis(val));
    console.log("--- codepoints não-ASCII:", [...new Set([...val].filter((c) => c.charCodeAt(0) > 0x2000))].map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase()} ${c}`).join(" | "));
  }
  console.log("\nMarkers:", JSON.stringify({
    gabaritoCorrigido: t.gabaritoCorrigido ?? null,
    promptRestaurado: t.promptRestaurado ?? null,
    imagensCorrigidas: t.imagensCorrigidas ?? null,
    imagensMigradas: t.imagensMigradas ?? null,
  }, null, 1));
  process.exit(0);
}

const all = await db.collection("questionsBank").orderBy(admin.firestore.FieldPath.documentId()).get();
console.log(`Total de questões: ${all.size}\n`);

const stats = {};
for (const key of Object.keys(PATTERNS)) stats[key] = { docs: new Set(), hits: 0, samples: [] };
const charCount = {};

for (const d of all.docs) {
  const t = d.data();
  for (const [fieldName, val] of fields(t)) {
    if (!val) continue;
    for (const ch of val) {
      const cp = ch.codePointAt(0);
      if (cp >= 0x2000 && cp !== 0x2013 && cp !== 0x2014 && cp !== 0x2018 && cp !== 0x2019 && cp !== 0x201c && cp !== 0x201d && cp !== 0x2026) {
        const k = `U+${cp.toString(16).toUpperCase()} ${ch}`;
        charCount[k] = (charCount[k] || 0) + 1;
      }
    }
    for (const [key, re] of Object.entries(PATTERNS)) {
      re.lastIndex = 0;
      let m; let found = false;
      while ((m = re.exec(val))) {
        found = true;
        stats[key].hits++;
        if (stats[key].samples.length < nSamples) {
          const start = Math.max(0, m.index - 40);
          stats[key].samples.push(`${d.id} ${fieldName}: …${vis(val.slice(start, m.index + m[0].length + 40))}…`);
        }
      }
      if (found) stats[key].docs.add(d.id);
    }
  }
}

for (const [key, s] of Object.entries(stats)) {
  console.log(`\n### ${key}: ${s.hits} ocorrências em ${s.docs.size} docs`);
  for (const smp of s.samples) console.log("  •", smp);
  if (s.docs.size <= 30) console.log("  docs:", [...s.docs].join(", "));
}

console.log("\n### Codepoints especiais (>= U+2000, exceto pontuação tipográfica comum):");
for (const [k, n] of Object.entries(charCount).sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`  ${k}: ${n}`);
process.exit(0);
