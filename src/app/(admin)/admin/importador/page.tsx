"use client";

import { FormEvent, useMemo, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { Button } from "@/components/ui/Button";
import { auth } from "@/lib/firebase";

type ImportSummary = {
  rowsRead: number | null;
  invalidRows: number | null;
  created: number | null;
  updated: number | null;
  deleted: number | null;
  warnings: number | null;
};

type ImportValidation = {
  totalQuestions: number;
  missingExamId: number;
  missingLevelId: number;
  missingThemeIds: number;
  invalidExamId: number;
  invalidLevelId: number;
  invalidThemeIds: number;
};

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-black text-slate-900">{value}</div>
    </div>
  );
}

export default function ImportadorPage() {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [validation, setValidation] = useState<ImportValidation | null>(null);
  const [output, setOutput] = useState("");

  const hasSummary = useMemo(() => Boolean(summary), [summary]);
  const hasValidationIssues = useMemo(() => {
    if (!validation) return false;
    const totalIssues =
      validation.missingExamId +
      validation.missingLevelId +
      validation.missingThemeIds +
      validation.invalidExamId +
      validation.invalidLevelId +
      validation.invalidThemeIds;
    return totalIssues > 0;
  }, [validation]);

  const handleImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setSummary(null);
    setValidation(null);
    setOutput("");

    if (!file) {
      setErrorMsg("Selecione uma planilha .xlsx para importar.");
      return;
    }

    setImporting(true);

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Sessão inválida. Faça login novamente.");

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/questions/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        output?: string;
        summary?: ImportSummary;
        validation?: ImportValidation;
      };

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Não foi possível importar a planilha.");
      }

      setSummary(data.summary ?? null);
      setValidation(data.validation ?? null);
      setOutput(data.output ?? "");
      setSuccessMsg("Importação concluída. As linhas inválidas continuam sendo ignoradas.");
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Erro ao importar a planilha.");
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setExporting(true);

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Sessão inválida. Faça login novamente.");

      const res = await fetch("/api/admin/questions/export", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || "Não foi possível exportar a planilha.");
      }

      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") || "";
      const fileNameMatch = disposition.match(/filename="(.+)"/i);
      const fileName = fileNameMatch?.[1] ?? "questionsBank-export.xls";

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      setSuccessMsg("Exportação concluída. O arquivo foi baixado no formato .xls.");
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Erro ao exportar a planilha.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <AdminShell
      title="Importador / Exportador"
      subtitle="Faça importação em massa e gere backups do banco de questões no mesmo layout da planilha operacional."
    >
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-5">
            <div className="text-2xl font-black text-slate-900">Importar planilha</div>
            <div className="mt-1 text-sm text-slate-500">
              Aceita `.xlsx` e aplica a sincronização direto no `questionsBank`.
            </div>
          </div>

          <form onSubmit={handleImport} className="space-y-5 p-5">
            <label className="block">
              <div className="mb-2 text-sm font-semibold text-slate-700">Arquivo da planilha</div>
              <input
                type="file"
                accept=".xlsx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600"
              />
            </label>

            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
              O importador usa o mesmo processo da sincronização manual, preserva `docId` como ID
              do documento e ignora linhas inválidas. Padrão atual: no app do aluno as alternativas
              devem aparecer em ordem fixa (`A, B, C, D, E`), sem embaralhar a exibição; a letra
              correta varia entre questões pela ordem salva no banco.
            </div>

            {errorMsg ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorMsg}
              </div>
            ) : null}

            {successMsg ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {successMsg}
              </div>
            ) : null}

            <Button type="submit" variant="primary" disabled={importing}>
              {importing ? "Importando..." : "Importar questões"}
            </Button>
          </form>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-5">
            <div className="text-2xl font-black text-slate-900">Exportar backup</div>
            <div className="mt-1 text-sm text-slate-500">
              Gera um `.xls` com a aba `firebase_import` no mesmo layout usado para importação.
            </div>
          </div>

          <div className="space-y-5 p-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
              Ideal para backup do banco, revisão em planilha e posterior reimportação pelos
              administradores.
            </div>

            <Button variant="secondary" disabled={exporting} onClick={handleExport}>
              {exporting ? "Exportando..." : "Exportar planilha"}
            </Button>
          </div>
        </div>
      </div>

      {hasSummary ? (
        <div className="mt-6 rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-5">
            <div className="text-2xl font-black text-slate-900">Resumo da importação</div>
          </div>

          <div className="grid gap-4 p-5 md:grid-cols-3 xl:grid-cols-6">
            <Metric label="Linhas lidas" value={String(summary?.rowsRead ?? "—")} />
            <Metric label="Inválidas" value={String(summary?.invalidRows ?? "—")} />
            <Metric label="Criadas" value={String(summary?.created ?? "—")} />
            <Metric label="Atualizadas" value={String(summary?.updated ?? "—")} />
            <Metric label="Excluídas" value={String(summary?.deleted ?? "—")} />
            <Metric label="Avisos" value={String(summary?.warnings ?? "—")} />
          </div>

          {validation ? (
            <div className="border-t border-slate-200 p-5">
              <div className="mb-2 text-sm font-semibold text-slate-700">Validação pós-importação</div>
              <div
                className={
                  hasValidationIssues
                    ? "mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                    : "mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
                }
              >
                {hasValidationIssues
                  ? "Importação concluída com pendências de vínculo (Prova/Nível/Tema)."
                  : "Validação OK: todos os vínculos de Prova, Nível e Tema estão consistentes."}
              </div>

              <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-7">
                <Metric label="Total banco" value={String(validation.totalQuestions)} />
                <Metric label="Sem prova" value={String(validation.missingExamId)} />
                <Metric label="Sem nível" value={String(validation.missingLevelId)} />
                <Metric label="Sem tema" value={String(validation.missingThemeIds)} />
                <Metric label="Prova inválida" value={String(validation.invalidExamId)} />
                <Metric label="Nível inválido" value={String(validation.invalidLevelId)} />
                <Metric label="Tema inválido" value={String(validation.invalidThemeIds)} />
              </div>
            </div>
          ) : null}

          {output ? (
            <div className="border-t border-slate-200 p-5">
              <div className="mb-2 text-sm font-semibold text-slate-700">Saída técnica</div>
              <pre className="overflow-x-auto rounded-2xl bg-slate-950 px-4 py-4 text-xs text-slate-100">
                {output}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </AdminShell>
  );
}
