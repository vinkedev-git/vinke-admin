"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { buttonStyles } from "@/components/ui/Button";
import { auth } from "@/lib/firebase";
import { cn } from "@/lib/cn";

type ChartMode = "erros" | "questoes";

type DashboardStats = {
  questoesTotal: number;
  questoesComComentario: number;
  errosPendentes: number;
  alunosTotal: number;
  alunosAtivos: number;
  alunosInativos: number;
  usuariosOnline: number;
  usuariosOnlineWeb: number;
  usuariosOnlineApp: number;
  usuariosHoje: number;
  usuariosWebHoje: number;
  usuariosAppHoje: number;
};

const EMPTY_STATS: DashboardStats = {
  questoesTotal: 0,
  questoesComComentario: 0,
  errosPendentes: 0,
  alunosTotal: 0,
  alunosAtivos: 0,
  alunosInativos: 0,
  usuariosOnline: 0,
  usuariosOnlineWeb: 0,
  usuariosOnlineApp: 0,
  usuariosHoje: 0,
  usuariosWebHoje: 0,
  usuariosAppHoje: 0,
};

const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export default function AdminDashboardPage() {
  const router = useRouter();
  const [chartMode, setChartMode] = useState<ChartMode>("erros");
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState("");
  const [errorSeries, setErrorSeries] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [questionSeries, setQuestionSeries] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);

  const loadDashboard = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Sessão inválida. Faça login novamente.");

      const res = await fetch("/api/admin/dashboard/stats", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        stats?: DashboardStats;
        series?: {
          buckets?: string[];
          questoes?: number[];
          erros?: number[];
        };
      };

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Não foi possível carregar os indicadores.");
      }

      setStats(data.stats ?? EMPTY_STATS);
      setQuestionSeries(
        Array.isArray(data.series?.questoes) ? data.series?.questoes : [0, 0, 0, 0, 0, 0, 0]
      );
      setErrorSeries(
        Array.isArray(data.series?.erros) ? data.series?.erros : [0, 0, 0, 0, 0, 0, 0]
      );
    } catch (error) {
      setErrorMsg(
        error instanceof Error ? error.message : "Não foi possível carregar os indicadores."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const chartData = useMemo(() => {
    return chartMode === "erros" ? errorSeries : questionSeries;
  }, [chartMode, errorSeries, questionSeries]);

  const hoje = useMemo(() => {
    const d = new Date();
    return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
  }, []);

  const submitGlobalSearch = () => {
    const value = globalSearch.trim();
    if (!value) return;
    router.push(`/admin/questoes?busca=${encodeURIComponent(value)}`);
  };

  return (
    <div className="min-h-screen overflow-x-hidden">
      <div className="mx-auto max-w-[1200px] px-4 py-6 pl-20 sm:px-6 lg:pl-6">
        {/* Page header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="font-display text-[22px] font-bold text-vinke-ink dark:text-white">
              Visão geral
            </h1>
            <div className="text-xs font-medium text-vinke-ink3">
              {hoje}
              {errorMsg ? null : " · tudo operando normalmente"}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden items-center gap-2 rounded-[9px] border-[1.5px] border-vinke-line bg-white px-3.5 py-2 md:flex md:w-[240px] dark:border-vinke-navy-line dark:bg-vinke-navy-card">
              <span className="text-vinke-ink3">⌕</span>
              <input
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitGlobalSearch();
                }}
                placeholder="Buscar em tudo…"
                className="w-full bg-transparent text-xs font-medium text-vinke-ink outline-none placeholder:text-vinke-ink3 dark:text-slate-200"
              />
            </div>

            <button
              type="button"
              onClick={() => void loadDashboard()}
              disabled={loading}
              className={buttonStyles({ variant: "secondary", size: "sm" })}
            >
              {loading ? "Atualizando…" : "Atualizar"}
            </button>

            <Link href="/admin/questoes/nova" className={buttonStyles({ variant: "primary", size: "sm" })}>
              + Nova questão
            </Link>
          </div>
        </div>

        {errorMsg ? (
          <div className="mt-4 flex flex-col gap-1.5 rounded-[12px] bg-vinke-red-soft p-4 dark:bg-vinke-red/10">
            <span className="font-display text-[13px] font-bold text-vinke-red dark:text-vinke-red-dark">
              Não foi possível carregar
            </span>
            <span className="text-xs font-medium text-vinke-ink2 dark:text-slate-300">{errorMsg}</span>
            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="mt-1 self-start rounded-[8px] border-[1.5px] border-vinke-red px-3 py-1.5 text-[11px] font-bold text-vinke-red"
            >
              Tentar novamente
            </button>
          </div>
        ) : null}

        {/* KPIs */}
        <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <StatCard label="Alunos ativos" value={stats.alunosAtivos} loading={loading} />
          <StatCard label="Alunos cadastrados" value={stats.alunosTotal} loading={loading} />
          <StatCard
            label="Online agora"
            value={stats.usuariosOnline}
            hint={`${stats.usuariosOnlineWeb} web · ${stats.usuariosOnlineApp} app`}
            accent={stats.usuariosOnline > 0 ? "green" : undefined}
            loading={loading}
          />
          <StatCard
            label="Usaram hoje"
            value={stats.usuariosHoje}
            hint={`${stats.usuariosWebHoje} web · ${stats.usuariosAppHoje} app`}
            loading={loading}
          />
          <StatCard label="Questões no banco" value={stats.questoesTotal} loading={loading} />
          <StatCard label="Com comentário" value={stats.questoesComComentario} loading={loading} />
          <StatCard label="Alunos inativos" value={stats.alunosInativos} loading={loading} />
          <StatCard
            label="Erros pendentes"
            value={stats.errosPendentes}
            accent={stats.errosPendentes > 0 ? "red" : undefined}
            loading={loading}
          />
        </div>

        {/* Chart + side column */}
        <div className="mt-3 grid grid-cols-1 items-start gap-2.5 lg:grid-cols-[1.7fr_1fr]">
          <div className="rounded-[13px] bg-white p-[18px] dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card">
            <div className="flex items-center justify-between gap-3">
              <span className="font-display text-[13px] font-bold text-vinke-ink dark:text-white">
                {chartMode === "erros" ? "Erros reportados — 7 dias" : "Questões criadas — 7 dias"}
              </span>
              <div className="flex gap-0.5 rounded-[10px] bg-[#EFEDF5] p-[3px] dark:bg-vinke-navy">
                {(
                  [
                    { value: "erros", label: "Erros" },
                    { value: "questoes", label: "Questões" },
                  ] as { value: ChartMode; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setChartMode(opt.value)}
                    className={cn(
                      "rounded-[8px] px-4 py-[7px] text-xs transition",
                      opt.value === chartMode
                        ? "bg-white font-bold text-vinke-ink shadow-[0_1px_3px_rgba(11,10,33,0.08)] dark:bg-vinke-navy-sel dark:text-white"
                        : "font-semibold text-vinke-ink3"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <MiniLineChart data={chartData} />
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-2 rounded-[13px] bg-white p-4 dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card">
              <span className="font-display text-[13px] font-bold text-vinke-ink dark:text-white">
                Alertas
              </span>
              {stats.errosPendentes > 0 ? (
                <Link
                  href="/admin/erros-reportados"
                  className="flex items-center gap-2.5 rounded-[10px] bg-vinke-red-soft px-3 py-2.5 transition hover:opacity-90 dark:bg-vinke-red/10"
                >
                  <span className="font-display text-base font-bold text-vinke-red dark:text-vinke-red-dark">
                    {stats.errosPendentes}
                  </span>
                  <span className="text-[11px] font-semibold leading-tight text-vinke-ink2 dark:text-slate-300">
                    erros reportados aguardando moderação
                  </span>
                  <span className="ml-auto text-[11px] font-bold text-vinke-red dark:text-vinke-red-dark">→</span>
                </Link>
              ) : (
                <div className="rounded-[10px] bg-vinke-green-soft px-3 py-2.5 text-[11px] font-semibold text-vinke-green-text dark:bg-vinke-green/10 dark:text-vinke-green">
                  Nenhuma pendência — tudo em dia.
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 rounded-[13px] bg-white p-4 dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card">
              <span className="font-display text-[13px] font-bold text-vinke-ink dark:text-white">
                Atalhos
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <ShortcutChip href="/admin/questoes/nova" label="+ Questão" />
                <ShortcutChip href="/admin/importador" label="Importar prova" />
                <ShortcutChip href="/admin/simulados" label="+ Simulado" />
                <ShortcutChip href="/admin/administradores" label="Convidar admin" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 text-xs text-vinke-ink4">© 2026 Vinke — Admin</div>
      </div>
    </div>
  );
}

/* ------------------------------- UI pieces ------------------------------ */

function StatCard({
  label,
  value,
  hint,
  accent,
  loading,
}: {
  label: string;
  value: number | string;
  hint?: string;
  accent?: "green" | "red";
  loading?: boolean;
}) {
  return (
    <div className="flex flex-col rounded-[13px] bg-white p-[15px] dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card">
      <span className="text-[11px] font-semibold text-vinke-ink3">{label}</span>
      {loading ? (
        <div className="mt-2 h-7 w-16 animate-pulse rounded-[7px] bg-vinke-line2 dark:bg-vinke-navy-sel" />
      ) : (
        <span
          className={cn(
            "font-display text-[28px] font-bold leading-[1.15] [font-variant-numeric:tabular-nums]",
            accent === "green"
              ? "text-vinke-green-text dark:text-vinke-green"
              : accent === "red"
                ? "text-vinke-red dark:text-vinke-red-dark"
                : "text-vinke-ink dark:text-white"
          )}
        >
          {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
        </span>
      )}
      {hint ? <span className="text-[10px] font-medium text-vinke-ink4">{hint}</span> : null}
    </div>
  );
}

function ShortcutChip({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-[9px] bg-vinke-soft px-3 py-2.5 text-[11px] font-bold text-vinke transition hover:bg-vinke-ring dark:bg-vinke/15 dark:text-vinke-lav dark:hover:bg-vinke/25"
    >
      {label}
    </Link>
  );
}

function MiniLineChart({ data }: { data: number[] }) {
  const w = 620;
  const h = 120;
  const pad = 10;

  const max = Math.max(1, ...data);

  const points = data.map((v, i) => {
    const x = (i / Math.max(1, data.length - 1)) * (w - pad * 2) + pad;
    const y = h - pad - (v / max) * (h - pad * 2);
    return { x, y };
  });

  const polyline = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const last = points[points.length - 1];

  const labels = useMemo(() => {
    const out: string[] = [];
    for (let i = data.length - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      out.push(`${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return out;
  }, [data.length]);

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="block w-full" preserveAspectRatio="none">
        {[0.17, 0.5, 0.83].map((f) => (
          <line
            key={f}
            x1={0}
            x2={w}
            y1={h * f}
            y2={h * f}
            className="stroke-vinke-line2 dark:stroke-vinke-navy-line"
            strokeWidth="1"
          />
        ))}
        <polyline
          points={polyline}
          fill="none"
          strokeWidth="3"
          className="stroke-vinke dark:stroke-vinke-lav"
        />
        {last ? <circle cx={last.x} cy={last.y} r="5" className="fill-vinke dark:fill-vinke-green" /> : null}
      </svg>
      <div className="mt-2 flex justify-between text-[10px] font-medium text-vinke-ink4">
        {labels.map((l, i) => (
          <span key={`${l}-${i}`}>{l}</span>
        ))}
      </div>
    </div>
  );
}
