"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, RefreshCw } from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { buttonStyles } from "@/components/ui/Button";
import { api } from "@/lib/apiClient";
import { cn } from "@/lib/cn";

type YearRow = {
  year: number;
  title: string;
  imported: number;
  total: number | null;
};

type ImportProgress = {
  year: number;
  done: number;
  total: number | null;
};

export default function ProvasEnemPage() {
  const [years, setYears] = useState<YearRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await api.get<{ years: YearRow[] }>("/api/admin/enem");
      setYears(data.years);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Não foi possível carregar.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const importYear = async (year: number) => {
    if (progress) return; // uma importação por vez
    setProgress({ year, done: 0, total: null });
    try {
      let offset = 0;
      let hasMore = true;
      let doneCount = 0;
      while (hasMore) {
        const res = await api.post<{
          imported: number;
          nextOffset: number;
          total: number | null;
          hasMore: boolean;
        }>("/api/admin/enem", { year, offset });
        doneCount += res.imported;
        offset = res.nextOffset;
        hasMore = res.hasMore;
        setProgress({ year, done: doneCount, total: res.total });
      }
      toast.success(`ENEM ${year}: ${doneCount} questões importadas.`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Falha ao importar o ENEM ${year}.`);
    } finally {
      setProgress(null);
    }
  };

  return (
    <AdminShell
      title="Provas ENEM"
      subtitle="Importe as provas oficiais direto da base pública — questões entram classificadas por área, com gabarito e imagens."
      actions={
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          <RefreshCw size={14} aria-hidden="true" /> Atualizar
        </button>
      }
    >
      {errorMsg ? (
        <div className="mb-4 flex flex-col gap-1.5 rounded-[12px] bg-vinke-red-soft p-4 dark:bg-vinke-red/10">
          <span className="font-display text-[13px] font-bold text-vinke-red dark:text-vinke-red-dark">
            Não foi possível consultar a base do ENEM
          </span>
          <span className="text-xs font-medium text-vinke-ink2 dark:text-slate-300">{errorMsg}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-1 self-start rounded-[8px] border-[1.5px] border-vinke-red px-3 py-1.5 text-[11px] font-bold text-vinke-red"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5">
        {loading
          ? [0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-[60px] animate-pulse rounded-[13px] bg-white dark:bg-vinke-navy-card"
              />
            ))
          : years.map((row) => {
              const isImporting = progress?.year === row.year;
              const done = isImporting ? progress.done : row.imported;
              const total = isImporting ? (progress.total ?? row.total) : row.total;
              const pct =
                total && total > 0 ? Math.min(100, Math.round((done / total) * 100)) : done > 0 ? 100 : 0;
              const complete = total != null && done >= total && total > 0;

              return (
                <div
                  key={row.year}
                  className="flex items-center gap-4 rounded-[13px] bg-white px-4 py-3.5 dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card"
                >
                  <span className="w-24 shrink-0 font-display text-base font-bold text-vinke-ink dark:text-white">
                    ENEM {row.year}
                  </span>

                  <div className="h-2 min-w-0 flex-1 rounded-full bg-vinke-line2 dark:bg-vinke-navy-sel">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        complete ? "bg-vinke-green" : "bg-vinke"
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <span
                    className={cn(
                      "w-24 shrink-0 text-right font-display text-xs font-bold [font-variant-numeric:tabular-nums]",
                      complete ? "text-vinke-green-text dark:text-vinke-green" : "text-vinke-ink dark:text-white"
                    )}
                  >
                    {done}
                    {total != null ? `/${total}` : ""}
                  </span>

                  {isImporting ? (
                    <span className="w-28 shrink-0 rounded-full bg-vinke-soft px-3 py-1 text-center text-[10px] font-bold text-vinke dark:bg-vinke/15 dark:text-vinke-lav">
                      Importando…
                    </span>
                  ) : complete ? (
                    <span className="w-28 shrink-0 rounded-full bg-vinke-green-soft px-3 py-1 text-center text-[10px] font-bold text-vinke-green-text dark:bg-vinke-green/15 dark:text-vinke-green">
                      Completa
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void importYear(row.year)}
                      disabled={Boolean(progress)}
                      className={cn(buttonStyles({ variant: "primary", size: "sm" }), "w-28 shrink-0")}
                    >
                      <Download size={13} aria-hidden="true" />
                      {done > 0 ? "Completar" : "Importar"}
                    </button>
                  )}
                </div>
              );
            })}
      </div>

      <div className="mt-5 text-[11px] leading-relaxed text-vinke-ink4">
        Fonte: base pública enem.dev (provas oficiais do INEP). As questões entram ativas, com
        gabarito, imagens e área do conhecimento; a classificação fina por disciplina e assunto
        pode ser feita depois, no banco de questões. Questões de idiomas entram nas duas línguas
        (inglês e espanhol). A reimportação de uma prova é segura — nada é duplicado.
      </div>
    </AdminShell>
  );
}
