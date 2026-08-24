export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { adminDb } from "@/lib/firebaseAdmin";

const execFileAsync = promisify(execFile);

function parseMetric(output: string, label: string) {
  const match = output.match(new RegExp(`${label}:\\s*(\\d+)`, "i"));
  return match ? Number(match[1]) : null;
}

type ValidationSummary = {
  totalQuestions: number;
  missingExamId: number;
  missingLevelId: number;
  missingThemeIds: number;
  invalidExamId: number;
  invalidLevelId: number;
  invalidThemeIds: number;
};

async function runPostImportValidation(): Promise<ValidationSummary> {
  const [questionsSnap, provasSnap, niveisSnap, temasSnap] = await Promise.all([
    adminDb.collection("questionsBank").get(),
    adminDb.collection("catalog_provas").get(),
    adminDb.collection("catalog_niveis").get(),
    adminDb.collection("catalog_temas").get(),
  ]);

  const examIds = new Set(provasSnap.docs.map((docSnap) => docSnap.id));
  const levelIds = new Set(niveisSnap.docs.map((docSnap) => docSnap.id));
  const themeIds = new Set(temasSnap.docs.map((docSnap) => docSnap.id));

  const validation: ValidationSummary = {
    totalQuestions: questionsSnap.size,
    missingExamId: 0,
    missingLevelId: 0,
    missingThemeIds: 0,
    invalidExamId: 0,
    invalidLevelId: 0,
    invalidThemeIds: 0,
  };

  for (const docSnap of questionsSnap.docs) {
    const data = docSnap.data() || {};
    const examId = typeof data.examId === "string" ? data.examId.trim() : "";
    const levelId = typeof data.levelId === "string" ? data.levelId.trim() : "";
    const rowThemeIds = Array.isArray(data.themeIds)
      ? data.themeIds.map((value) => String(value).trim()).filter(Boolean)
      : [];

    if (!examId) validation.missingExamId += 1;
    else if (!examIds.has(examId)) validation.invalidExamId += 1;

    if (!levelId) validation.missingLevelId += 1;
    else if (!levelIds.has(levelId)) validation.invalidLevelId += 1;

    if (!rowThemeIds.length) validation.missingThemeIds += 1;
    else if (rowThemeIds.some((id) => !themeIds.has(id))) validation.invalidThemeIds += 1;
  }

  return validation;
}

export async function POST(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  let tempPath = "";

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Selecione um arquivo .xlsx." }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json(
        { ok: false, error: "O importador aceita apenas arquivos .xlsx." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    tempPath = path.join("/tmp", `questions-import-${Date.now()}.xlsx`);
    await fs.writeFile(tempPath, buffer);

    const scriptPath = path.join(process.cwd(), "scripts", "sync-questions-from-xlsx.mjs");
    const { stdout, stderr } = await execFileAsync("node", [
      scriptPath,
      `--file=${tempPath}`,
      "--apply",
      "--skip-invalid",
    ]);

    const combinedOutput = [stdout, stderr].filter(Boolean).join("\n").trim();
    const validation = await runPostImportValidation();

    return NextResponse.json(
      {
        ok: true,
        summary: {
          rowsRead: parseMetric(combinedOutput, "Linhas lidas"),
          invalidRows: parseMetric(combinedOutput, "Inválidas"),
          created: parseMetric(combinedOutput, "Criadas"),
          updated: parseMetric(combinedOutput, "Atualizadas"),
          deleted: parseMetric(combinedOutput, "Excluídas"),
          warnings: parseMetric(combinedOutput, "Avisos"),
        },
        validation,
        output: combinedOutput,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao importar planilha.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    if (tempPath) {
      await fs.unlink(tempPath).catch(() => undefined);
    }
  }
}
