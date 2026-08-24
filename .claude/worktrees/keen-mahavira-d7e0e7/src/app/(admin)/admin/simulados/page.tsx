"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { Button, buttonStyles } from "@/components/ui/Button";
import { api } from "@/lib/apiClient";

type SimuladoListItem = {
  uid: string;
  sessionId: string;
  createdAt: string;
  endedAt: string;
  aluno: string;
  totalQuestions: number;
  nota: number;
  status: "pendente" | "concluido";
};

function StatusBadge({ status }: { status: SimuladoListItem["status"] }) {
  const cls =
    status === "concluido"
      ? "bg-emerald-100 text-emerald-700"
      : "bg-sky-100 text-sky-700";

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase ${cls}`}>
      {status === "concluido" ? "concluído" : "pendente"}
    </span>
  );
}

export default function SimuladosPage() {
  const [items, setItems] = useState<SimuladoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setErrorMsg(null);

      try {
        const data = await api.get<{ items?: SimuladoListItem[] }>("/api/admin/simulados");

        if (active) {
          setItems(data.items ?? []);
        }
      } catch (error) {
        if (active) {
          setErrorMsg(
            error instanceof Error ? error.message : "Não foi possível carregar os simulados."
          );
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
      [item.createdAt, item.aluno, item.totalQuestions, item.nota, item.status]
        .join(" ")
        .toLowerCase()
        .includes(s)
    );
  }, [items, search]);

  const removeItem = async (item: SimuladoListItem) => {
    setDeletingId(item.sessionId);
    setErrorMsg(null);

    try {
      await api.delete(`/api/admin/simulados/${item.uid}/${item.sessionId}`);

      setItems((prev) => prev.filter((current) => current.sessionId !== item.sessionId));
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Erro ao excluir o simulado.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AdminShell
      title="Simulados"
      subtitle="Acompanhe os simulados em andamento e concluídos para monitorar o uso da plataforma."
      actions={
        <div className="relative w-full md:w-[340px]">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            ⌕
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar simulados..."
            className="w-full rounded-2xl border border-slate-200 bg-white px-11 py-3 text-sm outline-none transition focus:border-blue-200 focus:ring-2 focus:ring-blue-200"
          />
        </div>
      }
    >
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-5">
          <div className="text-2xl font-black text-slate-900">Simulados</div>
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
          <table className="min-w-[1080px] w-full text-sm">
            <thead className="border-b bg-slate-100/80 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              <tr>
                <th className="px-5 py-4 text-left">Criado em</th>
                <th className="px-5 py-4 text-left">Aluno</th>
                <th className="px-5 py-4 text-left">Questões</th>
                <th className="px-5 py-4 text-left">Nota</th>
                <th className="px-5 py-4 text-left">Status</th>
                <th className="px-5 py-4 text-right">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-500">
                    Nenhum simulado encontrado.
                  </td>
                </tr>
              ) : null}

              {filtered.map((item) => (
                <tr key={item.sessionId} className="hover:bg-slate-50/70">
                  <td className="px-5 py-4 text-slate-600">
                    <div>{item.createdAt}</div>
                    <div className="mt-1 text-xs text-slate-400">Encerrado: {item.endedAt}</div>
                  </td>
                  <td className="px-5 py-4 font-semibold text-slate-800">{item.aluno}</td>
                  <td className="px-5 py-4 text-slate-600">{item.totalQuestions}</td>
                  <td className="px-5 py-4">
                    <span className="inline-flex rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700">
                      {item.nota.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/admin/simulados/${item.uid}/${item.sessionId}`}
                        className={buttonStyles({ variant: "primary", size: "sm" })}
                      >
                        Gerenciar
                      </Link>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={deletingId === item.sessionId}
                        onClick={() => removeItem(item)}
                      >
                        Excluir
                      </Button>
                    </div>
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
