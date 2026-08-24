import { GoogleAuth } from "google-auth-library";
import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key]) continue;
    let value = trimmed.slice(eq + 1).trim();
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

const rulesPath = process.argv[2];
if (!rulesPath) {
  console.error("Usage: node deploy-firestore-rules.mjs <path-to-firestore.rules>");
  process.exit(1);
}
const rulesContent = fs.readFileSync(rulesPath, "utf8");

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const auth = new GoogleAuth({
  credentials: {
    client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    private_key: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/firebase"],
});
const client = await auth.getClient();
const base = `https://firebaserules.googleapis.com/v1`;

// 1. Create new ruleset
const rulesetRes = await client.request({
  url: `${base}/projects/${projectId}/rulesets`,
  method: "POST",
  data: {
    source: {
      files: [{ name: "firestore.rules", content: rulesContent }],
    },
  },
});
const rulesetName = rulesetRes.data.name;
console.log(`Created ruleset: ${rulesetName}`);

// 2. Point the cloud.firestore release at it
const releaseName = `projects/${projectId}/releases/cloud.firestore`;
const releaseRes = await client.request({
  url: `${base}/${releaseName}`,
  method: "PATCH",
  data: {
    release: { name: releaseName, rulesetName },
  },
});
console.log(`Release updated: ${releaseRes.data.name}`);
console.log(`Now serving ruleset: ${releaseRes.data.rulesetName}`);
