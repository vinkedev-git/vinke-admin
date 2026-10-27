"use client";
// Card de Configurações: e-mails automáticos do plano gratuito.
// Mostra as últimas execuções do cron e permite enviar um teste para o próprio admin.
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/Button";

type Run = {
  at: string | null;
  trigger: string | null;
  unauthorized: boolean;
  candidatos: { d1: number; d3: number } | null;
  resultado: { d1: { enviados: number; pulados: number; erros: number }; d3: { enviados: number; pulados: number; erros: number }; dryRun?: boolean; adiados?: { d1: number; d3: number } } | null;
  erros: string[];
  duracaoMs: number | null;
};

async function authed(path: string, init?: RequestInit) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Sessão inválida. Faça login novamente.");
  const res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

export default function EmailsGratuitoCard() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = (await authed("/api/admin/emails-gratuito")) as { runs: Run[] };
      setRuns(data.runs);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const teste = async (tipo: "d1" | "d3") => {
    setBusy(tipo);
    setMsg(null);
    try {
      const data = (await authed("/api/admin/emails-gratuito", { method: "POST", body: JSON.stringify({ tipo }) })) as { enviadoPara: string; assunto: string };
      setMsg(`Enviado para ${data.enviadoPara}: "${data.assunto}". Confira a caixa de entrada (e o spam).`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold">E-mails do plano gratuito</h2>
        <p className="text-sm text-slate-500">
          Cron diário às 9h (Brasília): D+1 traz a questão do dia e os erros; D+3 oferece o Passe (ou o Anual depois do ENEM). Máximo de 80 envios por dia (cota do Resend: 100).
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => void teste("d1")} disabled={busy !== null}>
          {busy === "d1" ? "Enviando…" : "Enviar D+1 para mim"}
        </Button>
        <Button onClick={() => void teste("d3")} disabled={busy !== null}>
          {busy === "d3" ? "Enviando…" : "Enviar D+3 para mim"}
        </Button>
        <Button onClick={() => void load()} disabled={busy !== null}>
          Atualizar
        </Button>
      </div>
      {msg && <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">{msg}</p>}

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-2 pr-4">Quando</th>
              <th className="py-2 pr-4">Origem</th>
              <th className="py-2 pr-4">D+1</th>
              <th className="py-2 pr-4">D+3</th>
              <th className="py-2 pr-4">Erros</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              <tr>
                <td className="py-3 text-slate-500" colSpan={5}>Nenhuma execução registrada ainda.</td>
              </tr>
            )}
            {runs.map((r, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-2 pr-4 whitespace-nowrap">{fmt(r.at)}</td>
                <td className="py-2 pr-4">{r.unauthorized ? "recusado (sem credencial)" : r.trigger ?? "—"}</td>
                <td className="py-2 pr-4">{r.resultado ? `${r.resultado.d1.enviados} enviados · ${r.resultado.d1.pulados} pulados` : "—"}</td>
                <td className="py-2 pr-4">{r.resultado ? `${r.resultado.d3.enviados} enviados · ${r.resultado.d3.pulados} pulados` : "—"}</td>
                <td className="py-2 pr-4">{r.erros?.length ? r.erros.join(" · ") : r.resultado ? "0" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
