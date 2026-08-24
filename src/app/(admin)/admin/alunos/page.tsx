"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, Pencil, Trash2, Users } from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { Button, buttonStyles } from "@/components/ui/Button";
import { StatusBadge, type EntitlementStatus } from "@/components/ui/StatusBadge";
import { SearchInput } from "@/components/ui/SearchInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { api } from "@/lib/apiClient";

type AlunoListItem = {
  uid: string;
  code: string;
  createdAt: string;
  name: string;
  cpf: string;
  cellphone: string;
  email: string;
  active: boolean;
  status?: EntitlementStatus;
};

export default function AlunosPage() {
  const [items, setItems] = useState<AlunoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { dialog: confirmDialog, confirm } = useConfirm();

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get<{ items?: AlunoListItem[] }>("/api/admin/alunos");
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar os alunos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const onDeleteAluno = async (item: AlunoListItem) => {
    const ok = await confirm({
      title: `Excluir aluno "${item.name}"?`,
      description: "Essa ação remove autenticação e todos os dados do aluno e não pode ser desfeita.",
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;

    setDeletingUid(item.uid);
    try {
      await api.delete(`/api/admin/alunos/${item.uid}`);
      setItems((prev) => prev.filter((x) => x.uid !== item.uid));
      toast.success(`Aluno ${item.name} excluído com sucesso.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir o aluno.");
    } finally {
      setDeletingUid(null);
    }
  };

  const syncEduzz = async () => {
    setSyncing(true);
    const toastId = toast.loading("Sincronizando com Eduzz...");
    try {
      const data = await api.post<{
        imported?: number; createdUsers?: number; updatedUsers?: number; skipped?: number;
        reasons?: { blockedStatus?: number; withoutPaidInvoice?: number; expired?: number; withoutDate?: number };
      }>("/api/admin/alunos/sync-eduzz", {
        startDate: "2025-01-01T00:00:00.000Z",
        endDate: new Date().toISOString(),
      });

      toast.success(
        `${data.imported ?? 0} importado(s) · ${data.createdUsers ?? 0} criado(s) · ${data.updatedUsers ?? 0} atualizado(s) · ${data.skipped ?? 0} ignorado(s)`,
        { id: toastId, description: "Sincronização Eduzz concluída" }
      );
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível sincronizar com Eduzz.", { id: toastId });
    } finally {
      setSyncing(false);
    }
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return items;
    return items.filter((item) =>
      [item.code, item.name, item.cpf, item.cellphone, item.email].join(" ").toLowerCase().includes(s)
    );
  }, [items, search]);

  return (
    <AdminShell
      title="Alunos"
      subtitle={`${loading ? "Carregando..." : `${items.length.toLocaleString("pt-BR")} aluno(s) cadastrado(s)`}`}
      actions={
        <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Filtrar por nome, CPF, e-mail..." aria-label="Filtrar alunos" className="w-full md:w-72" />

          <Button variant="secondary" onClick={() => void syncEduzz()} loading={syncing}>
            <RefreshCw size={15} aria-hidden="true" />
            Sincronizar Eduzz
          </Button>

          <Link href="/admin/alunos/novo" className={buttonStyles({ variant: "primary" })}>
            <Plus size={15} aria-hidden="true" /> Criar aluno
          </Link>
        </div>
      }
    >
      {confirmDialog}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="min-w-[860px] w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
              <tr>
                {["Cód.", "Criado em", "Nome / E-mail", "CPF", "Celular", "Status", ""].map((h) => (
                  <th key={h} className={`px-5 py-3.5 text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400 ${h === "" ? "text-right" : "text-left"}`}>
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
                      icon={Users}
                      title={search ? "Nenhum aluno encontrado" : "Nenhum aluno cadastrado"}
                      description={search ? "Tente outros termos de busca." : "Crie o primeiro aluno para começar."}
                      action={
                        !search
                          ? <Link href="/admin/alunos/novo" className={buttonStyles({ variant: "primary", size: "sm" })}><Plus size={13} /> Criar aluno</Link>
                          : undefined
                      }
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.uid} className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-4 font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">{item.code}</td>
                    <td className="px-5 py-4 text-xs text-slate-500 dark:text-slate-400">{item.createdAt}</td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">{item.name}</div>
                      <div className="mt-0.5 text-xs text-slate-400">{item.email}</div>
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-400">{item.cpf}</td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-400">{item.cellphone}</td>
                    <td className="px-5 py-4">
                      <StatusBadge status={item.status ?? (item.active ? "ativo" : "inativo")} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Link href={`/admin/alunos/${item.uid}`} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                          <Pencil size={13} aria-hidden="true" /> Editar
                        </Link>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => void onDeleteAluno(item)}
                          loading={deletingUid === item.uid}
                        >
                          <Trash2 size={13} aria-hidden="true" /> Excluir
                        </Button>
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
