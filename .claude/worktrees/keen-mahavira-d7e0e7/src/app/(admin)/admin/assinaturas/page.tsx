"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/apiClient";

type AssinaturaItem = {
  uid: string;
  aluno: string;
  email: string;
  origem: string;
  plano: string;
  planoOrigem: "catalogo" | "eduzz" | "manual" | "sem-plano";
  status: "ativo" | "pendente" | "inativo";
  validade: string;
  planId: string;
  productId: string;
  productTitle: string;
  invoiceStatus: string;
  amountPaid: number | null;
  validUntilRaw: string;
};

type AssinaturaItemWithSort = AssinaturaItem & {
  sortSeconds: number;
};

function StatusBadge({ status }: { status: AssinaturaItem["status"] }) {
  const cls =
    status === "ativo"
      ? "bg-emerald-100 text-emerald-700"
      : status === "pendente"
      ? "bg-amber-100 text-amber-700"
      : "bg-slate-100 text-slate-600";

  return (
    <span className={`inline-flex rounded-full px-3 py-0.5 text-xs font-bold uppercase ${cls}`}>
      {status}
    </span>
  );
}

function planoOrigemLabel(origem: AssinaturaItem["planoOrigem"]) {
  if (origem === "catalogo") return "Catálogo";
  if (origem === "eduzz") return "Eduzz";
  if (origem === "manual") return "Manual";
  return "Sem plano";
}

export default function AssinaturasPage() {
  const [items, setItems] = useState<AssinaturaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const data = await api.get<{ items?: AssinaturaItemWithSort[] }>("/api/admin/assinaturas");

        if (active) {
          const rows = Array.isArray(data.items)
            ? data.items.map((item) => ({
                uid: item.uid,
                aluno: item.aluno,
                email: item.email,
                origem: item.origem,
                plano: item.plano,
                planoOrigem: item.planoOrigem,
                status: item.status,
                validade: item.validade,
                planId: item.planId,
                productId: item.productId,
                productTitle: item.productTitle,
                invoiceStatus: item.invoiceStatus,
                amountPaid: item.amountPaid,
                validUntilRaw: item.validUntilRaw,
              }))
            : [];
          setItems(rows);
        }
      } catch (error) {
        if (active) {
          setErrorMsg(
            error instanceof Error ? error.message : "Não foi possível carregar as assinaturas."
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
      [item.aluno, item.email, item.origem, item.plano, item.status, item.planoOrigem]
        .join(" ")
        .toLowerCase()
        .includes(s)
    );
  }, [items, search]);

  const quickUpdateStatus = async (item: AssinaturaItem, nextStatus: "ativo" | "pendente") => {
    setUpdatingUid(item.uid);
    setErrorMsg(null);

    try {
      await api.patch(`/api/admin/assinaturas/${item.uid}`, {
        email: item.email === "—" ? "" : item.email,
        active: nextStatus === "ativo",
        pending: nextStatus === "pendente",
        planId: item.planId,
        productId: item.productId,
        productTitle: item.productTitle,
        invoiceStatus: item.invoiceStatus,
        amountPaid: item.amountPaid,
        validUntil: item.validUntilRaw,
      });

      setItems((prev) =>
        prev.map((current) =>
          current.uid === item.uid
            ? {
                ...current,
                status: nextStatus,
              }
            : current
        )
      );
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Erro ao atualizar a assinatura.");
    } finally {
      setUpdatingUid(null);
    }
  };

  return (
    <AdminShell
      title="Assinaturas"
      subtitle="Gerencie o acesso dos alunos. Eduzz atualiza automaticamente; alunos manuais podem ser ajustados aqui."
      actions={
        <div className="relative w-full md:w-[340px]">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            ⌕
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar assinaturas..."
            className="w-full rounded-2xl border border-slate-200 bg-white px-11 py-3 text-sm outline-none transition focus:border-blue-200 focus:ring-2 focus:ring-blue-200"
          />
        </div>
      }
    >
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-5">
          <div className="text-2xl font-black text-slate-900">Assinaturas</div>
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
          <table className="min-w-[1180px] w-full text-sm">
            <thead className="border-b bg-slate-100/80 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              <tr>
                <th className="px-5 py-3 text-left">Aluno</th>
                <th className="px-5 py-3 text-left">Origem</th>
                <th className="px-5 py-3 text-left">Plano</th>
                <th className="px-5 py-3 text-left">Validade</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-left">Ação rápida</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-500">
                    Nenhuma assinatura encontrada.
                  </td>
                </tr>
              ) : null}

              {filtered.map((item) => (
                <tr key={item.uid} className="hover:bg-slate-50/70">
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-semibold text-slate-800">{item.aluno}</span>
                      <span className="text-xs text-slate-500">{item.email}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-600 uppercase">{item.origem}</td>
                  <td className="px-5 py-4 text-slate-600">
                    <div className="font-semibold text-slate-700">{item.plano}</div>
                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                      {planoOrigemLabel(item.planoOrigem)}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-600">{item.validade}</td>
                  <td className="px-5 py-4">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="min-h-8 rounded-lg px-2.5 py-1 text-xs"
                        variant={item.status === "ativo" ? "primary" : "secondary"}
                        disabled={updatingUid === item.uid}
                        onClick={() => quickUpdateStatus(item, "ativo")}
                      >
                        Ativar
                      </Button>
                      <Button
                        size="sm"
                        className="min-h-8 rounded-lg px-2.5 py-1 text-xs"
                        variant={item.status === "pendente" ? "primary" : "secondary"}
                        disabled={updatingUid === item.uid}
                        onClick={() => quickUpdateStatus(item, "pendente")}
                      >
                        Pendente
                      </Button>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/admin/assinaturas/${item.uid}/fatura`}
                        className="inline-flex min-h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Gerenciar
                      </Link>
                      <Link
                        href={`/admin/assinaturas/${item.uid}`}
                        className="inline-flex min-h-8 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white transition hover:border-slate-800 hover:bg-slate-800"
                      >
                        Editar
                      </Link>
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
