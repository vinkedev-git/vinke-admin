// Classifica o ASSUNTO de questões que já têm disciplina mas estão sem assunto.
// Derivado de classify-questions.mjs; a disciplina é fixa (não muda).
//
// Uso:
//   node scripts/classify-assuntos.mjs --disc=disc-matematica --dry-run --limit=12
//   node scripts/classify-assuntos.mjs --disc=disc-matematica
//   node scripts/classify-assuntos.mjs --disc=disc-espanhol --fixo=ass-espanhol-interpretacao-de-texto-em-espanhol   # sem IA
//
// Requer ANTHROPIC_API_KEY + FIREBASE_ADMIN_* no .env.local (cwd = vinke-admin).

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i === -1) continue;
    const k = t.slice(0, i).trim(); if (!k || process.env[k]) continue;
    let v = t.slice(i + 1).trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
loadEnvFile(path.resolve(process.cwd(), ".env.local"));
const req = (n) => { const v = process.env[n]; if (!v) throw new Error(`Missing env var: ${n}`); return v; };

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? "true"] : [a, "true"]; }));
const DRY_RUN = "dry-run" in args;
const LIMIT = Number(args.limit) || Infinity;
const MODEL = args.model || "claude-opus-5";
const DISC = args.disc; if (!DISC) throw new Error("--disc=disc-xxx obrigatório");
const FIXO = args.fixo || null;
const CHUNK = 12;

const app = getApps()[0] ?? initializeApp({ credential: cert({ projectId: req("FIREBASE_ADMIN_PROJECT_ID"), clientEmail: req("FIREBASE_ADMIN_CLIENT_EMAIL"), privateKey: req("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n") }) });
const db = getFirestore(app);

const stripHtml = (h) => String(h ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const slugify = (v) => String(v).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const normKey = (v) => String(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

async function main() {
  const taxSnap = await db.collection("taxonomia").get();
  const nodes = taxSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const disc = nodes.find((n) => n.id === DISC && n.tipo === "disciplina"); if (!disc) throw new Error(`disciplina ${DISC} não existe na taxonomia`);
  const existentes = nodes.filter((n) => n.tipo === "assunto" && n.ativo !== false && n.disciplinaId === DISC);

  const snap = await db.collection("questionsBank").where("disciplinaId", "==", DISC).get();
  const pending = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((q) => q.isActive !== false && !(q.assuntoIds?.length)).slice(0, LIMIT);
  console.log(`${disc.nome}: ${existentes.length} assuntos existentes (${existentes.map((a) => a.nome).join(", ")}). Pendentes: ${pending.length}.`);
  if (!pending.length) return;

  const gravar = async (q, assuntoDoc, by) => {
    if (DRY_RUN) return;
    await db.collection("questionsBank").doc(q.id).set({ assuntoIds: [assuntoDoc.id], assuntos: [assuntoDoc.nome], themes: [assuntoDoc.nome], themeIds: [assuntoDoc.id], classifiedBy: by, classifiedAt: new Date(), updatedAt: new Date() }, { merge: true });
  };

  if (FIXO) {
    const a = existentes.find((x) => x.id === FIXO); if (!a) throw new Error(`assunto ${FIXO} não existe`);
    for (const q of pending) await gravar(q, a, "regra:assunto-unico");
    console.log(`${DRY_RUN ? "(dry-run) " : ""}${pending.length} questões → "${a.nome}"`);
    return;
  }

  req("ANTHROPIC_API_KEY");
  const anthropic = new Anthropic();
  const Schema = z.object({ classificacoes: z.array(z.object({ id: z.string(), assunto: z.string() })) });
  const system = [{ type: "text", cache_control: { type: "ephemeral" }, text:
    `Você classifica questões do ENEM de ${disc.nome} por assunto, para uma plataforma de estudos.\n\n` +
    `ASSUNTOS EXISTENTES: ${existentes.map((a) => a.nome).join(", ")}\n\n` +
    `Para cada questão escolha UM assunto: o tema matemático central que o aluno precisa dominar para resolver (não o contexto do enunciado). ` +
    `PREFIRA um assunto existente (copie o nome exato). Só crie um nome novo se nenhum couber; nesse caso use nome curto e reutilizável no mesmo padrão (ex.: "Geometria analítica", "Equações e sistemas", "Números e operações", "Leitura de gráficos e tabelas"). ` +
    `Responda para TODAS as questões recebidas, na mesma ordem, usando o campo id.` }];

  let done = 0, created = 0, skipped = 0; const novos = {};
  for (let i = 0; i < pending.length; i += CHUNK) {
    const chunk = pending.slice(i, i + CHUNK);
    const lista = chunk.map((q) => `id: ${q.id}\nquestão: ${stripHtml(q.prompt_text ?? q.prompt).slice(0, 700)}\nalternativas: ${(q.options ?? []).map((o) => stripHtml(o.text).slice(0, 80)).filter(Boolean).join(" | ").slice(0, 300)}`).join("\n\n---\n\n");
    let r;
    try { r = await anthropic.messages.parse({ model: MODEL, max_tokens: 4096, system, messages: [{ role: "user", content: `Classifique estas questões:\n\n${lista}` }], output_config: { format: zodOutputFormat(Schema) } }); }
    catch (e) { console.error(`Lote ${i / CHUNK + 1}: falha (${e.message})`); skipped += chunk.length; continue; }
    if (!r.parsed_output) { skipped += chunk.length; continue; }
    const byId = new Map(r.parsed_output.classificacoes.map((c) => [c.id, c]));
    for (const q of chunk) {
      const c = byId.get(q.id); if (!c) { skipped++; continue; }
      let a = existentes.find((x) => normKey(x.nome) === normKey(c.assunto));
      if (!a) {
        const id = `ass-${DISC.replace(/^disc-/, "")}-${slugify(c.assunto)}`;
        a = { id, tipo: "assunto", nome: c.assunto.trim(), areaId: disc.areaId, disciplinaId: DISC, ordem: 999, ativo: true };
        if (!DRY_RUN) await db.collection("taxonomia").doc(id).set({ ...a, createdAt: new Date(), updatedAt: new Date(), createdBy: "classificador-claude" }, { merge: true });
        existentes.push(a); created++;
      }
      novos[a.nome] = (novos[a.nome] || 0) + 1;
      if (DRY_RUN) console.log(`  ${q.id} → ${a.nome}`);
      await gravar(q, a, `claude:${MODEL}`); done++;
    }
    console.log(`Lote ${Math.floor(i / CHUNK) + 1}/${Math.ceil(pending.length / CHUNK)} ok`);
  }
  console.log(`\nConcluído${DRY_RUN ? " (dry-run)" : ""}: ${done} classificadas, ${created} assuntos novos, ${skipped} puladas.`);
  console.log("Distribuição:", JSON.stringify(novos, null, 1));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
