"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonStyles } from "@/components/ui/Button";
import { auth } from "@/lib/firebase";

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

  const submitGlobalSearch = () => {
    const value = globalSearch.trim();
    if (!value) return;
    router.push(`/admin/questoes?busca=${encodeURIComponent(value)}`);
  };

  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* Top header */}
      <div className="sticky top-0 z-10 border-b border-slate-200/70 bg-slate-50/70 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
        <div className="mx-auto max-w-[1200px] px-4 py-4 pl-24 sm:px-6 sm:pl-24 lg:pl-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="break-words text-xs text-slate-500">
                Painel Administrativo <span className="mx-1">•</span> Anestesia Questões
              </div>
              <div className="break-words text-2xl font-black text-slate-900">Dashboard</div>
              <div className="break-words text-sm text-slate-500">Visão geral do sistema</div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <SearchStub
                value={globalSearch}
                onChange={setGlobalSearch}
                onSubmit={submitGlobalSearch}
              />

              <div className="hidden sm:flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                <div className="h-8 w-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center font-black text-blue-700 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-blue-300">
                  AQ
                </div>
                <div className="leading-tight">
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-50">Admin</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Acesso total</div>
                </div>
              </div>

              <Button
                onClick={() => void loadDashboard()}
                variant="secondary"
                size="sm"
                disabled={loading}
              >
                {loading ? "Atualizando..." : "Atualizar"}
              </Button>

              <Link
                href="/admin/questoes/nova"
                className={buttonStyles({ variant: "primary", size: "sm" })}
              >
                Nova questão
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
        {/* Hero card */}
        <div className="rounded-[32px] border border-slate-200 bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)] overflow-hidden dark:border-slate-800 dark:bg-slate-950">
          {/* subtle gradient */}
          <div className="bg-gradient-to-b from-blue-50/60 via-white to-white px-4 py-5 sm:px-6 sm:py-6 dark:from-slate-900 dark:via-slate-950 dark:to-slate-950">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-lg font-black text-slate-900">Visão geral</div>
                <div className="text-sm text-slate-500">
                  Indicadores ao vivo do Firestore.
                </div>
              </div>

              <div className="hidden md:flex items-center gap-2">
                <Segmented
                  value={chartMode}
                  onChange={setChartMode}
                  options={[
                    { value: "erros", label: "Erros (7 dias)" },
                    { value: "questoes", label: "Questões (7 dias)" },
                  ]}
                />
              </div>
            </div>

            {errorMsg ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorMsg}
              </div>
            ) : null}

            {/* KPI cards */}
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <KpiCard
                icon="🧠"
                title="Banco de Questões"
                subtitle="Total cadastradas"
                value={stats.questoesTotal}
                pill={{ label: "Ativo", tone: "ok" }}
              />

              <KpiCard
                icon="📝"
                title="Questões com comentário"
                subtitle="Comentário preenchido"
                value={stats.questoesComComentario}
                pill={{ label: "Didático", tone: "neutral" }}
              />

              <KpiCard
                icon="🧯"
                title="Erros reportados"
                subtitle="Pendentes de revisão"
                value={stats.errosPendentes}
                pill={{ label: "Atenção", tone: "warn" }}
              />

              <KpiCard
                icon="👤"
                title="Alunos"
                subtitle="Total cadastrados"
                value={stats.alunosTotal}
                pill={{ label: "Geral", tone: "neutral" }}
              />

              <KpiCard
                icon="✅"
                title="Alunos ativos"
                subtitle="Com acesso liberado"
                value={stats.alunosAtivos}
                pill={{ label: "Ativo", tone: "ok" }}
              />

              <KpiCard
                icon="⏸️"
                title="Alunos inativos"
                subtitle="Sem acesso no momento"
                value={stats.alunosInativos}
                pill={{ label: "Inativo", tone: "warn" }}
              />

              <KpiCard
                icon="🟢"
                title="Online agora"
                subtitle={`${stats.usuariosOnlineWeb} web · ${stats.usuariosOnlineApp} app`}
                value={stats.usuariosOnline}
                pill={{ label: "Tempo real", tone: "ok" }}
              />

              <KpiCard
                icon="📍"
                title="Usaram hoje"
                subtitle="Alunos com acesso registrado hoje"
                value={stats.usuariosHoje}
                pill={{ label: "Hoje", tone: "neutral" }}
              />

              <KpiCard
                icon="📱"
                title="Web / App hoje"
                subtitle={`${stats.usuariosWebHoje} web · ${stats.usuariosAppHoje} app`}
                value={`${stats.usuariosWebHoje}/${stats.usuariosAppHoje}`}
                pill={{ label: "Origem", tone: "neutral" }}
              />
            </div>

            {/* Graph + Actions */}
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
              {/* chart (smaller) */}
              <div className="lg:col-span-2">
                <PremiumMiniChartCard
                  title={chartMode === "erros" ? "Erros reportados" : "Criação de questões"}
                  subtitle="Últimos 7 dias"
                  data={chartData}
                  height={170} // << menor aqui
                  rightPill="Últimos 7 pontos"
                />
              </div>

              {/* actions in ONE big card (fix border/rounding) */}
              <div className="lg:col-span-1">
                <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3 border-b border-slate-100">
                    <div>
                      <div className="text-sm font-black text-slate-900">Atalhos</div>
                      <div className="text-xs text-slate-500">Ações rápidas do admin</div>
                    </div>
                    <span className="text-xs px-2.5 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-600">
                      rápido
                    </span>
                  </div>

                  <div className="p-4 space-y-3">
                    <QuickAction
                      title="Revisar erros"
                      desc="Ver pendências e responder com comentário."
                      href="/admin/erros-reportados"
                      icon="🧯"
                    />
                    <QuickAction
                      title="Banco de questões"
                      desc="Criar/editar questões e alternativas."
                      href="/admin/questoes"
                      icon="🧠"
                    />
                    <QuickAction
                      title="Alunos"
                      desc="Acessos, status e contas."
                      href="/admin/alunos"
                      icon="👤"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 text-xs text-slate-400">© 2026 Anestesia Questões — Admin</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- UI pieces ------------------------------ */

function SearchStub({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="hidden md:flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 w-[360px] dark:border-slate-800 dark:bg-slate-900">
      <span className="text-slate-400 dark:text-slate-500">⌕</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
        }}
        placeholder="Buscar no banco de questões..."
        className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400 text-slate-600 dark:text-slate-200 dark:placeholder:text-slate-500"
      />
      <button
        type="button"
        onClick={onSubmit}
        className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
      >
        Ir
      </button>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-1 flex gap-1 dark:border-slate-800 dark:bg-slate-900">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={[
              "px-3 py-2 rounded-xl text-xs font-semibold transition",
              active ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function KpiCard({
  icon,
  title,
  subtitle,
  value,
  pill,
}: {
  icon: string;
  title: string;
  subtitle: string;
  value: number | string;
  pill: { label: string; tone: "ok" | "warn" | "neutral" };
}) {
  const pillClass =
    pill.tone === "ok"
      ? "border-[#86efac] bg-[#dcfce7] text-[#14532d]"
      : pill.tone === "warn"
      ? "border-[#f59e0b] bg-[#fef3c7] text-[#78350f]"
      : "border-[#cbd5e1] bg-[#e2e8f0] text-[#0f172a]";

  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center dark:border-slate-700 dark:bg-slate-800">
            <span className="text-base">{icon}</span>
          </div>
          <div>
            <div className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">{title}</div>
            <div className="text-sm text-slate-600">{subtitle}</div>
          </div>
        </div>

        <span className={["text-xs px-2.5 py-1 rounded-full border font-bold", pillClass].join(" ")}>
          {pill.label}
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div className="text-3xl font-black text-slate-900">{value}</div>
        <div className="h-8 w-24 rounded-xl bg-slate-50 border border-slate-200 dark:border-slate-700 dark:bg-slate-800" />
      </div>
    </div>
  );
}

function PremiumMiniChartCard({
  title,
  subtitle,
  data,
  height,
  rightPill,
}: {
  title: string;
  subtitle: string;
  data: number[];
  height: number;
  rightPill: string;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900">
      <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3 border-b border-slate-100">
        <div>
          <div className="text-sm font-black text-slate-900">{title}</div>
          <div className="text-xs text-slate-500">{subtitle}</div>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {rightPill}
        </span>
      </div>

      <div className="p-4">
        <MiniAreaChart data={data} height={height} />

        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
          <span>Min: 0</span>
          <span>Máx: {Math.max(...data)}</span>
        </div>
      </div>
    </div>
  );
}

function MiniAreaChart({ data, height }: { data: number[]; height: number }) {
  const w = 780; // viewBox width
  const h = height;
  const pad = 18;

  const max = Math.max(1, ...data);
  const min = 0;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (w - pad * 2) + pad;
    const y = h - pad - ((v - min) / (max - min)) * (h - pad * 2);
    return { x, y, v };
  });

  const lineD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");

  const areaD =
    lineD +
    ` L ${points[points.length - 1].x.toFixed(2)} ${(h - pad).toFixed(2)}` +
    ` L ${points[0].x.toFixed(2)} ${(h - pad).toFixed(2)} Z`;

  const gridLines = 4;

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full block">
        <defs>
          <linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(37,99,235)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="rgb(37,99,235)" stopOpacity="0.02" />
          </linearGradient>
          <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="8" stdDeviation="10" floodOpacity="0.12" />
          </filter>
        </defs>

        {/* grid */}
        {Array.from({ length: gridLines }).map((_, idx) => {
          const y = pad + (idx / (gridLines - 1)) * (h - pad * 2);
          return (
            <line
              key={idx}
              x1={pad}
              x2={w - pad}
              y1={y}
              y2={y}
              stroke="rgb(226,232,240)"
              strokeDasharray="6 8"
            />
          );
        })}

        {/* area */}
        <path d={areaD} fill="url(#areaFill)" />

        {/* line */}
        <path d={lineD} fill="none" stroke="rgb(37,99,235)" strokeWidth="4" filter="url(#softShadow)" />

        {/* points */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="7" fill="rgb(37,99,235)" opacity="0.15" />
            <circle cx={p.x} cy={p.y} r="4" fill="rgb(37,99,235)" />
          </g>
        ))}

        {/* x labels (simples) */}
        {["S", "T", "Q", "Q", "S", "S", "D"].slice(0, data.length).map((lab, i) => {
          const x = (i / (data.length - 1)) * (w - pad * 2) + pad;
          return (
            <text
              key={lab + i}
              x={x}
              y={h - 4}
              textAnchor="middle"
              fontSize="14"
              fill="rgb(100,116,139)"
            >
              {lab}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function QuickAction({
  title,
  desc,
  href,
  icon,
}: {
  title: string;
  desc: string;
  href: string;
  icon: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 hover:bg-slate-50 transition dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/70"
    >
      <div className="h-10 w-10 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0 dark:border-slate-700 dark:bg-slate-800">
        <span className="text-base">{icon}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-sm font-extrabold text-slate-900">{title}</div>
        <div className="text-xs text-slate-500">{desc}</div>

        <div className="mt-3 text-[11px] font-semibold text-blue-700 group-hover:text-blue-800">
          ir →
        </div>
      </div>
    </Link>
  );
}
