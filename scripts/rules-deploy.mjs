// Publica vinke-aluno/firestore.rules no projeto via Firebase Rules API,
// autenticando com a service account (sem firebase-cli).
// Uso: node scripts/rules-deploy.mjs

import { readFileSync } from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { GoogleAuth } = require("google-auth-library");

const PROJECT = "vinke-74695";
const RULES_FILE = "/Users/davidrangel/Projetos/EnemQuest/vinke-aluno/firestore.rules";
const SA = "/Users/davidrangel/Projetos/EnemQuest/.secrets/vinke-74695-firebase-adminsdk-fbsvc-374e2db752.json";

async function main() {
  const auth = new GoogleAuth({
    keyFile: SA,
    scopes: ["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/firebase"],
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const base = `https://firebaserules.googleapis.com/v1/projects/${PROJECT}`;

  const source = readFileSync(RULES_FILE, "utf8");

  // 1) Testa a compilação criando o ruleset (erro de sintaxe falha aqui)
  const rs = await fetch(`${base}/rulesets`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ source: { files: [{ name: "firestore.rules", content: source }] } }),
  });
  const rsBody = await rs.json();
  if (!rs.ok) {
    console.error("ERRO ao criar ruleset:", JSON.stringify(rsBody, null, 2).slice(0, 3000));
    process.exit(1);
  }
  console.log("ruleset criado:", rsBody.name);

  // 2) Aponta o release do Firestore para o novo ruleset
  const releaseName = `projects/${PROJECT}/releases/cloud.firestore`;
  const rel = await fetch(`https://firebaserules.googleapis.com/v1/${releaseName}`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({ release: { name: releaseName, rulesetName: rsBody.name } }),
  });
  const relBody = await rel.json();
  if (!rel.ok) {
    console.error("ERRO ao publicar release:", JSON.stringify(relBody, null, 2).slice(0, 2000));
    process.exit(1);
  }
  console.log("release publicado:", relBody.rulesetName);
}

main().catch((e) => { console.error(e); process.exit(1); });
