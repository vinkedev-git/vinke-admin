"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { buttonStyles } from "@/components/ui/Button";
import { api } from "@/lib/apiClient";

type FaturaItem = {
  uid: string;
  aluno: string;
  email: string;
  total: number | null;
  createdAt: string;
  status: string;
  productTitle: string;
};

function formatMoney(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const cls =
    normalized === "emitida" || normalized === "ativo"
      ? "bg-emerald-100 text-emerald-700"
      : normalized === "pendente"
        ? "bg-amber-100 text-amber-700"
        : "bg-slate-100 text-slate-600";

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase ${cls}`}>
      {status || "pendente"}
    </span>
  );
}

export default function FaturasPage() {
  const [items, setItems] = useState<FaturaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setErrorMsg(null);

      try {
        const data = await api.get<{ items?: FaturaItem[] }>("/api/admin/faturas");

        if (active) setItems(data.items ?? []);
      } catch (error) {
        if (active) {
          setErrorMsg(error instanceof Error ? error.message : "Erro ao carregar as faturas.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return items;
    return items.filter((item) =>
      [item.aluno, item.email, item.status, item.productTitle, item.createdAt]
        .join(" ")
        .toLowerCase()
        .includes(s)
    );
  }, [items, search]);

  return (
    <AdminShell
      title="Faturas"
      subtitle="Acompanhe os registros financeiros e acesse o detalhe de cobrança por aluno."
      actions={
        <div className="relative w-full md:w-[340px]">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            ⌕
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar faturas..."
            className="w-full rounded-2xl border border-slate-200 bg-white px-11 py-3 text-sm outline-none transition focus:border-blue-200 focus:ring-2 focus:ring-blue-200"
          />
        </div>
      }
    >
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-5">
          <div className="text-2xl font-black text-slate-900">Faturas</div>
          <div className="mt-1 text-sm text-slate-500">
            {loading ? "Carregando..." : `${filtered.length} registros`}
          </div>
          {errorMsg ? (
            <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMsg}
            </div>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="border-b bg-slate-100/80 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              <tr>
                <th className="px-5 py-3 text-left">Aluno</th>
                <th className="px-5 py-3 text-left">Serviço</th>
                <th className="px-5 py-3 text-left">Total</th>
                <th className="px-5 py-3 text-left">Data</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-500">
                    Nenhuma fatura encontrada.
                  </td>
                </tr>
              ) : null}

              {filtered.map((item) => (
                <tr key={item.uid} className="hover:bg-slate-50/70">
                  <td className="px-5 py-4">
                    <div className="font-semibold text-slate-800">{item.aluno}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.email}</div>
                  </td>
                  <td className="px-5 py-4 text-slate-600">{item.productTitle}</td>
                  <td className="px-5 py-4 font-semibold text-slate-800">{formatMoney(item.total)}</td>
                  <td className="px-5 py-4 text-slate-600">{item.createdAt}</td>
                  <td className="px-5 py-4">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/admin/assinaturas/${item.uid}/fatura`}
                      className={buttonStyles({ variant: "primary", size: "sm" })}
                    >
                      Gerenciar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
