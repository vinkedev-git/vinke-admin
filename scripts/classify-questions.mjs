// Classificação fina das questões com Claude: define disciplina + assunto
// (da taxonomia) para questões que só têm a área (ex.: importadas do ENEM).
//
// Uso:
//   npm run questions:classify              # classifica todas as pendentes
//   node scripts/classify-questions.mjs --limit=24        # só um lote de teste
//   node scripts/classify-questions.mjs --dry-run         # não grava nada
//   node scripts/classify-questions.mjs --model=claude-haiku-4-5  # modelo mais barato
//
// Requer ANTHROPIC_API_KEY no .env.local (console.anthropic.com → API Keys).

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import fs from "node:fs";
import path from "node:path";

// ─── Env ─────────────────────────────────────────────────────────────────────

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    if (!key || process.env[key]) continue;
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.resolve(process.cwd(), ".env.local"));
loadEnvFile(path.resolve(process.cwd(), ".env"));

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

// ─── Flags ───────────────────────────────────────────────────────────────────

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? "true"] : [a, "true"];
  })
);
const DRY_RUN = args["dry-run"] === "true" && "dry-run" in args;
const LIMIT = Number(args.limit) || Infinity;
const MODEL = args.model || "claude-opus-5";
const CHUNK = 12;

// ─── Firebase ────────────────────────────────────────────────────────────────

const app =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert({
          projectId: requiredEnv("FIREBASE_ADMIN_PROJECT_ID"),
          clientEmail: requiredEnv("FIREBASE_ADMIN_CLIENT_EMAIL"),
          privateKey: requiredEnv("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n"),
        }),
      });
const db = getFirestore(app);

// ─── Claude ──────────────────────────────────────────────────────────────────

requiredEnv("ANTHROPIC_API_KEY");
const anthropic = new Anthropic();

const ResultSchema = z.object({
  classificacoes: z.array(
    z.object({
      id: z.string(),
      disciplinaId: z.string(),
      assunto: z.string(),
    })
  ),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripHtml(html) {
  return String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normKey(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Taxonomia
  const taxSnap = await db.collection("taxonomia").get();
  const nodes = taxSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const areas = new Map(nodes.filter((n) => n.tipo === "area").map((n) => [n.id, n]));
  const disciplinas = nodes.filter((n) => n.tipo === "disciplina" && n.ativo !== false);
  const assuntosByDisc = new Map();
  for (const a of nodes.filter((n) => n.tipo === "assunto" && n.ativo !== false)) {
    const list = assuntosByDisc.get(a.disciplinaId) ?? [];
    list.push(a);
    assuntosByDisc.set(a.disciplinaId, list);
  }
  const discById = new Map(disciplinas.map((d) => [d.id, d]));

  const taxonomyText = disciplinas
    .map((d) => {
      const areaNome = areas.get(d.areaId)?.nome ?? d.areaId;
      const assuntos = (assuntosByDisc.get(d.id) ?? []).map((a) => a.nome).join(", ");
      return `- ${d.id} (${d.nome} · área: ${areaNome})\n  assuntos existentes: ${assuntos || "(nenhum)"}`;
    })
    .join("\n");

  const system = [
    {
      type: "text",
      text:
        `Você classifica questões do ENEM na taxonomia de uma plataforma de estudos.\n\n` +
        `DISCIPLINAS DISPONÍVEIS (use exatamente o id entre parênteses):\n${taxonomyText}\n\n` +
        `Para cada questão, escolha:\n` +
        `1. disciplinaId — o id da disciplina que melhor descreve a questão. A área informada da questão restringe as opções (ex.: área Ciências Humanas → historia, geografia, filosofia ou sociologia).\n` +
        `2. assunto — o assunto específico. PREFIRA um assunto já existente da disciplina (copie o nome exato). Só crie um nome novo se nenhum existente couber; nesse caso use um nome curto e reutilizável no padrão dos existentes (ex.: "Geografia urbana", não "questão sobre cidades").\n\n` +
        `Responda para TODAS as questões recebidas, na mesma ordem, usando o campo id de cada uma.`,
      cache_control: { type: "ephemeral" },
    },
  ];

  // 2. Questões pendentes (sem disciplina)
  const pendingSnap = await db
    .collection("questionsBank")
    .where("disciplinaId", "==", null)
    .get();

  const pending = pendingSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((q) => q.isActive !== false)
    .slice(0, LIMIT);

  console.log(`Taxonomia: ${disciplinas.length} disciplinas. Pendentes: ${pending.length} questões.`);
  if (!pending.length) return;

  let done = 0;
  let created = 0;
  let skipped = 0;

  for (let i = 0; i < pending.length; i += CHUNK) {
    const chunk = pending.slice(i, i + CHUNK);
    const lista = chunk
      .map((q) => {
        const areaNome = areas.get(q.areaId)?.nome ?? q.area ?? "desconhecida";
        const texto = stripHtml(q.prompt_text ?? q.prompt).slice(0, 600);
        const alternativas = (q.options ?? [])
          .map((o) => stripHtml(o.text).slice(0, 80))
          .filter(Boolean)
          .join(" | ")
          .slice(0, 300);
        return `id: ${q.id}\nárea: ${areaNome}\nquestão: ${texto}\nalternativas: ${alternativas}`;
      })
      .join("\n\n---\n\n");

    let response;
    try {
      response = await anthropic.messages.parse({
        model: MODEL,
        max_tokens: 4096,
        system,
        messages: [{ role: "user", content: `Classifique estas questões:\n\n${lista}` }],
        output_config: { format: zodOutputFormat(ResultSchema) },
      });
    } catch (error) {
      console.error(`Lote ${i / CHUNK + 1}: falha na API (${error.message}) — pulando.`);
      skipped += chunk.length;
      continue;
    }

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      console.error(`Lote ${i / CHUNK + 1}: sem resultado utilizável — pulando.`);
      skipped += chunk.length;
      continue;
    }

    const byId = new Map(response.parsed_output.classificacoes.map((c) => [c.id, c]));

    const batch = db.batch();
    for (const q of chunk) {
      const c = byId.get(q.id);
      if (!c) {
        skipped += 1;
        continue;
      }
      const disc = discById.get(c.disciplinaId);
      if (!disc) {
        console.warn(`  ${q.id}: disciplinaId inválido (${c.disciplinaId}) — pulando.`);
        skipped += 1;
        continue;
      }

      // resolve assunto: existente (nome normalizado) ou cria novo na taxonomia
      const existentes = assuntosByDisc.get(disc.id) ?? [];
      let assuntoDoc = existentes.find((a) => normKey(a.nome) === normKey(c.assunto));
      if (!assuntoDoc) {
        const assuntoId = `ass-${disc.id.replace(/^disc-/, "")}-${slugify(c.assunto)}`;
        assuntoDoc = {
          id: assuntoId,
          tipo: "assunto",
          nome: c.assunto.trim(),
          areaId: disc.areaId,
          disciplinaId: disc.id,
          ordem: 999,
          ativo: true,
        };
        if (!DRY_RUN) {
          batch.set(db.collection("taxonomia").doc(assuntoId), {
            ...assuntoDoc,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: "classificador-claude",
          }, { merge: true });
        }
        existentes.push(assuntoDoc);
        assuntosByDisc.set(disc.id, existentes);
        created += 1;
      }

      if (!DRY_RUN) {
        batch.set(
          db.collection("questionsBank").doc(q.id),
          {
            disciplinaId: disc.id,
            disciplina: disc.nome,
            levelId: disc.id,
            level: disc.nome,
            nivel: disc.nome,
            areaId: disc.areaId,
            area: areas.get(disc.areaId)?.nome ?? null,
            assuntoIds: [assuntoDoc.id],
            assuntos: [assuntoDoc.nome],
            themes: [assuntoDoc.nome],
            themeIds: [assuntoDoc.id],
            classifiedBy: `claude:${MODEL}`,
            classifiedAt: new Date(),
            updatedAt: new Date(),
          },
          { merge: true }
        );
      }
      done += 1;
    }
    if (!DRY_RUN) await batch.commit();

    const cacheInfo = response.usage?.cache_read_input_tokens
      ? ` (cache: ${response.usage.cache_read_input_tokens}t)`
      : "";
    console.log(
      `Lote ${Math.floor(i / CHUNK) + 1}/${Math.ceil(pending.length / CHUNK)}: ` +
      `${byId.size} classificadas${cacheInfo}`
    );
  }

  console.log(
    `\nConcluído${DRY_RUN ? " (dry-run — nada gravado)" : ""}: ` +
    `${done} questões classificadas, ${created} assuntos novos na taxonomia, ${skipped} puladas.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha:", err);
    process.exit(1);
  });
