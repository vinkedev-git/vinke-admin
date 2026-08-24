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

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const auth = new GoogleAuth({
  credentials: {
    client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    private_key: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/firebase"],
});
const client = await auth.getClient();

const base = `https://firebaserules.googleapis.com/v1/projects/${projectId}`;
const releases = await client.request({ url: `${base}/releases` });
const fsRelease = (releases.data.releases || []).find((r) =>
  r.name.includes("cloud.firestore")
);
if (!fsRelease) {
  console.log("No cloud.firestore release found");
  process.exit(1);
}
console.log(`Release: ${fsRelease.name}\nRuleset: ${fsRelease.rulesetName}\nUpdated: ${fsRelease.updateTime}\n---`);
const ruleset = await client.request({
  url: `https://firebaserules.googleapis.com/v1/${fsRelease.rulesetName}`,
});
for (const file of ruleset.data.source.files) {
  console.log(file.content);
}
