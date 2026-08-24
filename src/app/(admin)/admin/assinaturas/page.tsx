"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, CreditCard } from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { Button, buttonStyles } from "@/components/ui/Button";
import { StatusBadge, statusLabel } from "@/components/ui/StatusBadge";
import { SearchInput } from "@/components/ui/SearchInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/apiClient";

type AssinaturaItem = {
  uid: string;
  aluno: string;
  email: string;
  origem: string;
  plano: string;
  planoOrigem: "catalogo" | "eduzz" | "manual" | "sem-plano";
  status: "ativo" | "pendente" | "inativo" | "vencido";
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

function planoOrigemLabel(origem: AssinaturaItem["planoOrigem"]) {
  if (origem === "catalogo") return "Catálogo";
  if (origem === "eduzz") return "Eduzz";
  if (origem === "manual") return "Manual";
  return "Sem plano";
}

// ─── Nova assinatura modal ────────────────────────────────────────────────────

function NovaAssinaturaModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<{ uid: string; name: string; email: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const search = async () => {
    const q = value.trim();
    if (!q) return;
    setSearching(true);
    setFound(null);
    setNotFound(false);
    try {
      const data = await api.get<{ items?: Array<{ uid: string; name?: string; email?: string }> }>(
        `/api/admin/alunos?search=${encodeURIComponent(q)}`
      );
      const rows = Array.isArray(data.items) ? data.items : [];
      if (rows.length > 0) {
        const first = rows[0]!;
        setFound({
          uid: first.uid,
          name: String(first.name ?? "").trim() || "Sem nome",
          email: String(first.email ?? "").trim() || "—",
        });
      } else {
        setNotFound(true);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao buscar aluno.");
    } finally {
      setSearching(false);
    }
  };

  const goToSubscription = () => {
    if (found) router.push(`/admin/assinaturas/${found.uid}`);
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5">
          <div className="text-base font-bold text-slate-900 dark:text-slate-100">Nova assinatura</div>
          <div className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Busque o aluno pelo e-mail ou UID para configurar a assinatura manualmente.
          </div>
        </div>

        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => { setValue(e.target.value); setFound(null); setNotFound(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") void search(); }}
            placeholder="E-mail ou UID do aluno"
            className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
          />
          <Button variant="primary" size="sm" onClick={() => void search()} loading={searching}>
            Buscar
          </Button>
        </div>

        {notFound && (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
            Nenhum aluno encontrado com esse e-mail ou UID.
          </div>
        )}

        {found && (
          <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/40">
            <div className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">{found.name}</div>
            <div className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-500">{found.email}</div>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" size="sm" onClick={goToSubscription} disabled={!found}>
            Configurar assinatura →
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AssinaturasPage() {
  const [items, setItems] = useState<AssinaturaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
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
        if (active) toast.error(error instanceof Error ? error.message : "Não foi possível carregar as assinaturas.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => { active = false; };
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
          current.uid === item.uid ? { ...current, status: nextStatus } : current
        )
      );
      toast.success(`Assinatura de ${item.aluno} atualizada para ${statusLabel(nextStatus).toLowerCase()}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar a assinatura.");
    } finally {
      setUpdatingUid(null);
    }
  };

  return (
    <AdminShell
      title="Assinaturas"
      subtitle={loading ? "Carregando..." : `${items.length.toLocaleString("pt-BR")} assinatura(s)`}
      actions={
        <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Filtrar por aluno, e-mail, plano..."
            aria-label="Filtrar assinaturas"
            className="w-full md:w-72"
          />
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className={buttonStyles({ variant: "primary" })}
          >
            <Plus size={15} aria-hidden="true" /> Nova assinatura
          </button>
        </div>
      }
    >
      {showModal && <NovaAssinaturaModal onClose={() => setShowModal(false)} />}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
              <tr>
                {["Aluno", "Origem", "Plano", "Validade", "Status", "Ação rápida", ""].map((h) => (
                  <th
                    key={h}
                    className={`px-5 py-3.5 text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400 ${h === "" ? "text-right" : "text-left"}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <TableRowSkeleton cols={7} rows={6} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={CreditCard}
                      title={search ? "Nenhuma assinatura encontrada" : "Nenhuma assinatura cadastrada"}
                      description={search ? "Tente outros termos de busca." : "Crie uma assinatura para um aluno existente."}
                      action={
                        !search ? (
                          <button
                            type="button"
                            onClick={() => setShowModal(true)}
                            className={buttonStyles({ variant: "primary", size: "sm" })}
                          >
                            <Plus size={13} /> Nova assinatura
                          </button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.uid} className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">{item.aluno}</div>
                      <div className="mt-0.5 text-xs text-slate-400">{item.email}</div>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs uppercase text-slate-500 dark:text-slate-400">
                      {item.origem}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-700 dark:text-slate-300">{item.plano}</div>
                      <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                        {planoOrigemLabel(item.planoOrigem)}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-400">{item.validade}</td>
                    <td className="px-5 py-4">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={item.status === "ativo" ? "primary" : "secondary"}
                          loading={updatingUid === item.uid}
                          onClick={() => void quickUpdateStatus(item, "ativo")}
                        >
                          Ativar
                        </Button>
                        <Button
                          size="sm"
                          variant={item.status === "pendente" ? "primary" : "secondary"}
                          loading={updatingUid === item.uid}
                          onClick={() => void quickUpdateStatus(item, "pendente")}
                        >
                          Pendente
                        </Button>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/admin/assinaturas/${item.uid}/fatura`}
                          className={buttonStyles({ variant: "secondary", size: "sm" })}
                        >
                          Gerenciar
                        </Link>
                        <Link
                          href={`/admin/assinaturas/${item.uid}`}
                          className={buttonStyles({ variant: "primary", size: "sm" })}
                        >
                          Editar
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
