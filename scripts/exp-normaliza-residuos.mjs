// Normaliza resíduos de conversão da fonte enem.dev em prompt/prompt_text/options[].text:
//  1. expoente LaTeX + duplicata unicode  "10^{-8}10​−8"  ->  "10<sup>−8</sup>"
//  2. expoente unicode "flat" com ZWSP    "1,1x10​−1​​"    ->  "1,1x10<sup>−1</sup>"
//  3. zero-width spaces órfãos            removidos
//  4. imagem markdown "![alt](url ...)"   removida se já existe <img> com a mesma URL; senão vira <img>
//  5. link markdown "[label](url)"        vira só o label (citações)
//  6. ênfase markdown "_texto_"           -> "<em>texto</em>" (e a_ij_ -> a<sub>ij</sub>)
//  7. escapes markdown "\[…\]", "1\."     -> caractere literal
//
// Dry-run por padrão (mostra diffs, não grava). Uso:
//   node scripts/exp-normaliza-residuos.mjs [--id=ENEM2019_Q137] [--limit=N] [--write]
// Com --write: salva backup JSON dos docs afetados em backups/ antes de gravar.
// Respeita promptRestaurado: nesses docs, prompt/prompt_text não são tocados (options sim).
import { writeFileSync, mkdirSync } from "fs";
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
const limit = Number(arg("limit", "0"));
const doWrite = process.argv.includes("--write");

const stats = {};
let mute = false;
const bump = (k, n = 1) => { if (!mute) stats[k] = (stats[k] || 0) + n; };

// Casos truncados na própria fonte enem.dev, corrigidos pontualmente antes das regras.
const FIXUPS = {
  ENEM2011_Q132: [["w_indows_", "<em>windows</em>"]],
  ENEM2017_Q025: [["a_legria_", "<em>alegria</em>"]],
};
const aplicaFixups = (id, s) => {
  if (!s || !FIXUPS[id]) return s;
  let out = s;
  for (const [de, para] of FIXUPS[id]) {
    if (out.includes(de)) { bump("fixupManual"); out = out.split(de).join(para); }
  }
  return out;
};

function normaliza(s) {
  if (!s) return s;
  let out = s;

  // 1. ^{exp} com duplicata unicode logo em seguida (ex.: "10^{-8}10​−8    ​​" ou "^{ -2}​−2​​").
  //    A duplicata só é descartada se os dígitos e o sinal baterem com o expoente.
  out = out.replace(
    /\^\{\s*([-\u2212]?)\s*(\d+)\s*\}((?:10)?\u200B+([\u2212-]?)(\d+)[\u200B\t \u00A0\u2000-\u200A]*)?/g,
    (m, sign, exp, dup, dupSign, dupDigits, offset, str) => {
      const sup = `<sup>${sign ? "\u2212" : ""}${exp}</sup>`;
      if (dup === undefined) { bump("caretSemDup"); return sup; }
      if (dupDigits === exp && !!dupSign === !!sign) {
        bump("caretComDup");
        // se o lixo consumido tinha espaços e vem letra/dígito em seguida, devolve um espaço
        const next = str[offset + m.length];
        const sep = /[ \u00A0\u2000-\u200A]/.test(dup) && next && /[\p{L}\d]/u.test(next) ? " " : "";
        return sup + sep;
      }
      bump("caretDupDivergente");
      return sup + dup; // não bateu: mantém o texto seguinte intacto
    }
  );

  // 2. Expoente "flat": dígito + ZWSP + (sinal?)dígitos + ZWSP (ex.: "1,1x10​−1​​").
  out = out.replace(/(\d)​+([−-]?)(\d+)​+/g, (m, base, sign, exp) => {
    bump("expFlat");
    return `${base}<sup>${sign ? "−" : ""}${exp}</sup>`;
  });

  // 3. ZWSPs restantes são resíduo puro (ex.: em volta de <img> e radicais).
  out = out.replace(/​+/g, () => { bump("zwspOrfao"); return ""; });

  // 4. Imagem markdown. Se a mesma URL já está num <img> do campo, remove; senão converte.
  out = out.replace(
    /!\[[^\]]*\]\(\s*([^)\s]+)(?:\s+(?:"[^"]*"|&quot;[\s\S]*?&quot;))?\s*\)/g,
    (m, url) => {
      if (out.includes(`<img src="${url}"`)) { bump("mdImgDuplicada"); return ""; }
      bump("mdImgConvertida");
      return `<img src="${url}" alt="" style="max-width:100%">`;
    }
  );
  out = out.replace(/<p>\s*<\/p>/g, "");

  // 5. Link markdown de citação vira só o label.
  out = out.replace(/\[([^\]]{1,150})\]\(\s*(?:https?:\/\/|www\.)[^)\s]*\s*\)/g, (m, label) => {
    bump("mdLink");
    return label;
  });

  // 6a. Subscrito vindo de LaTeX a_{ij}: letra_alnum(1-3)_ vira <sub> (ex.: "a_ij_ =").
  out = out.replace(/(\p{L})_([A-Za-z0-9]{1,3})_(?!\p{L})/gu, (m, pre, inner) => {
    bump("underscoreSub");
    return `${pre}<sub>${inner}</sub>`;
  });

  // 6b. Ênfase _texto_ -> <em>texto</em> (fronteiras evitam snake_case; dígito antes é
  //     permitido para variáveis como "2_n_"; conteúdo pode ter tags inline como
  //     "_<strong>q</strong>_", mas não cruza parágrafos).
  const INNER = String.raw`(?:[^_<>\n]|<\/?(?:strong|em|b|i|sub|sup)>){1,500}?`;
  const EM_RE = new RegExp(
    String.raw`(^|[\s>(["'“”«»—–−\d])_(${INNER})_(?=[\s<).,;:!?"'“”«»⋅×—–−%…²³¹⁰-⁹]|$)`,
    "g"
  );
  out = out.replace(EM_RE, (m, pre, inner) => {
    bump("underscoreEm");
    return `${pre}<em>${inner}</em>`;
  });

  // 6c. Ênfase colada na palavra seguinte por perda de quebra de linha na conversão
  //     (ex.: "_Wikipédia_nos"): fecha o <em> e insere o espaço perdido.
  out = out.replace(
    new RegExp(String.raw`(^|[\s>(["'“”«»])_(${INNER})_(?=\p{L})`, "gu"),
    (m, pre, inner) => { bump("underscoreEmColado"); return `${pre}<em>${inner}</em> `; }
  );

  // 7. Escapes markdown de pontuação viram o caractere literal (ex.: "\[…\]" -> "[…]",
  //    "1\." -> "1.", "\_" em URL -> "_"). Roda por último para "\_" nunca virar ênfase.
  out = out.replace(/\\([\[\](){}.!#+*_>|~=-])/g, (m, ch) => {
    bump("mdEscape");
    return ch;
  });

  return out;
}

// Sinaliza resíduos que sobraram para revisão manual (fora de tags HTML), com contexto.
function sobras(s) {
  const foraDeTags = (s || "").replace(/<[^>]+>/g, " ");
  const found = [];
  const ctx = (re) => {
    const m = re.exec(foraDeTags);
    return m ? ` «…${foraDeTags.slice(Math.max(0, m.index - 35), m.index + 36)}…»` : "";
  };
  if (/​/.test(foraDeTags)) found.push("ZWSP" + ctx(/​/));
  if (/\^\{/.test(foraDeTags)) found.push("^{" + ctx(/\^\{/));
  if (/\]\(/.test(foraDeTags)) found.push("](" + ctx(/\]\(/));
  if (/_/.test(foraDeTags)) found.push("_" + ctx(/_/));
  return found;
}

let query = db.collection("questionsBank").orderBy(admin.firestore.FieldPath.documentId());
const snap = onlyId
  ? { docs: [await db.collection("questionsBank").doc(onlyId).get()].filter((d) => d.exists) }
  : await query.get();

const mudancas = []; // { id, upd, original }
const avisos = [];
let vistos = 0;

for (const d of snap.docs) {
  const t = d.data();
  const upd = {};
  const original = {};

  const campos = [];
  if (!t.promptRestaurado) {
    campos.push(["prompt", t.prompt], ["prompt_text", t.prompt_text]);
  } else {
    mute = true;
    const teria = normaliza(t.prompt) !== (t.prompt || "");
    mute = false;
    if (teria) avisos.push(`${d.id}: tem resíduo no prompt mas promptRestaurado — NÃO tocado`);
  }

  for (const [campo, valor] of campos) {
    const novo = normaliza(aplicaFixups(d.id, valor));
    if (novo !== (valor || "")) {
      upd[campo] = novo;
      original[campo] = valor;
    }
  }

  if (Array.isArray(t.options)) {
    let mudou = false;
    const novasOpts = t.options.map((o) => {
      const novo = normaliza(aplicaFixups(d.id, o.text));
      if (novo !== (o.text || "")) { mudou = true; return { ...o, text: novo }; }
      return o;
    });
    if (mudou) {
      upd.options = novasOpts;
      original.options = t.options;
    }
  }

  if (!Object.keys(upd).length) continue;

  for (const [campo, valor] of Object.entries(upd)) {
    const textos = campo === "options" ? valor.map((o) => o.text || "") : [valor];
    for (const s of textos) {
      const resto = sobras(s);
      if (resto.length) avisos.push(`${d.id} ${campo}: sobrou ${resto.join(", ")} após normalização`);
    }
  }

  mudancas.push({ id: d.id, upd, original });
  vistos++;
  if (limit && vistos >= limit) break;
}

console.log(`Docs com mudanças: ${mudancas.length}`);
console.log("Substituições:", JSON.stringify(stats, null, 1));

if (!doWrite) {
  // Dry-run: mostra diff resumido dos primeiros docs
  const mostrar = Number(arg("show", "10"));
  for (const { id, upd, original } of mudancas.slice(0, mostrar)) {
    console.log(`\n===== ${id} =====`);
    for (const campo of Object.keys(upd)) {
      if (campo === "options") {
        original.options.forEach((o, i) => {
          if ((upd.options[i].text || "") !== (o.text || "")) {
            console.log(`  [${o.id}] ANTES: ${JSON.stringify(o.text)}`);
            console.log(`  [${o.id}] DEPOIS: ${JSON.stringify(upd.options[i].text)}`);
          }
        });
      } else {
        console.log(`  ${campo} ANTES: ${JSON.stringify(original[campo]).slice(0, Number(arg("difflen", "600")))}`);
        console.log(`  ${campo} DEPOIS: ${JSON.stringify(upd[campo]).slice(0, Number(arg("difflen", "600")))}`);
      }
    }
  }
  if (avisos.length) console.log("\nAVISOS:\n" + avisos.map((a) => "  ! " + a).join("\n"));
  console.log("\nDry-run: nada gravado. Use --write para aplicar.");
  process.exit(0);
}

// --write: backup primeiro, depois grava
mkdirSync(new URL("../backups/", import.meta.url), { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const bkPath = new URL(`../backups/normaliza-residuos-${ts}.json`, import.meta.url).pathname;
writeFileSync(bkPath, JSON.stringify(mudancas.map(({ id, original }) => ({ id, original })), null, 1));
console.log(`Backup dos campos originais: ${bkPath}`);

let ok = 0;
for (const { id, upd } of mudancas) {
  await db.collection("questionsBank").doc(id).update({
    ...upd,
    residuosNormalizados: "ênfase markdown, expoentes duplicados/flat e links markdown da fonte enem.dev normalizados para HTML",
  });
  ok++;
  if (ok % 50 === 0) console.log(`  ...${ok}/${mudancas.length}`);
}
console.log(`Gravados: ${ok}/${mudancas.length}`);
if (avisos.length) console.log("\nAVISOS:\n" + avisos.map((a) => "  ! " + a).join("\n"));
process.exit(0);
