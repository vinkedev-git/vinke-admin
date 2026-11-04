"use client";
// Visão geral: retenção por semana de cadastro (métrica do Vinke aberto).
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { cn } from "@/lib/cn";

type Coorte = {
  semana: string; aberto: boolean; cadastros: number; ativaram: number; ativaramPct: number;
  d1: number | null; d1Pct: number | null; d7: number | null; d7Pct: number | null;
};
type Resp = { aberto: boolean; total: number; ativos7d: number; ativosHoje: number; coortes: Coorte[] };

export default function RetencaoCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch("/api/admin/retencao", { headers: { Authorization: `Bearer ${token}` } });
        const j = await res.json();
        if (!res.ok || !j.ok) throw new Error(j.error || `Erro ${res.status}`);
        setData(j);
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const semaforo = (p: number | null) =>
    p == null ? "text-vinke-ink4" : p >= 20 ? "text-vinke-green-text dark:text-vinke-green" : p >= 12 ? "text-vinke-ink dark:text-white" : "text-vinke-red dark:text-vinke-red-dark";

  return (
    <div className="mt-3 rounded-[13px] bg-white p-[18px] dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="font-display text-[13px] font-bold text-vinke-ink dark:text-white">Retenção por semana de cadastro</span>
          <p className="mt-0.5 text-[11px] text-vinke-ink3">
            D1/D7 = voltou a responder 1 ou 7+ dias depois de criar a conta. Meta do Vinke aberto: D7 ≥ 20%.
          </p>
        </div>
        {data ? (
          <div className="flex gap-4 text-[11px] font-semibold text-vinke-ink3">
            <span>{data.ativosHoje} treinaram hoje</span>
            <span>{data.ativos7d} na semana</span>
            {data.aberto ? <span className="rounded-full bg-vinke-soft px-2 py-0.5 text-vinke dark:bg-vinke/15 dark:text-vinke-lav">Vinke aberto ativo</span> : null}
          </div>
        ) : null}
      </div>
      {erro ? <p className="mt-3 text-[12px] text-vinke-red">{erro}</p> : null}
      {!data && !erro ? <div className="mt-3 h-24 animate-pulse rounded-[7px] bg-vinke-line2 dark:bg-vinke-navy-sel" /> : null}
      {data ? (
        <table className="mt-3 w-full text-[12px] [font-variant-numeric:tabular-nums]">
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase tracking-wide text-vinke-ink4">
              <th className="py-1.5">Semana</th><th>Cadastros</th><th>Responderam</th><th>D1</th><th>D7</th>
            </tr>
          </thead>
          <tbody>
            {data.coortes.map((c) => (
              <tr key={c.semana} className="border-t border-vinke-line dark:border-vinke-navy-line">
                <td className="py-1.5 font-semibold text-vinke-ink dark:text-white">
                  {c.semana}{c.aberto ? <span className="ml-1.5 text-[9px] font-bold text-vinke">ABERTO</span> : null}
                </td>
                <td>{c.cadastros}</td>
                <td>{c.ativaram} <span className="text-vinke-ink4">({c.ativaramPct}%)</span></td>
                <td className={cn("font-bold", semaforo(c.d1Pct))}>{c.d1Pct == null ? "—" : `${c.d1Pct}%`}</td>
                <td className={cn("font-bold", semaforo(c.d7Pct))}>{c.d7Pct == null ? "—" : `${c.d7Pct}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
