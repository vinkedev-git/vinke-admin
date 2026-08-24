"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2, ShieldCheck } from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { auth } from "@/lib/firebase";
import { api } from "@/lib/apiClient";

type AdminItem = {
  uid: string;
  code: string;
  name: string;
  email: string;
  isCurrentUser: boolean;
};

export default function AdministradoresPage() {
  const [items, setItems] = useState<AdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const { dialog: confirmDialog, confirm } = useConfirm();

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const currentUid = auth.currentUser?.uid ?? "";
        const data = await api.get<{ items?: Array<{ uid: string; name: string; email: string }> }>(
          "/api/admin/administradores"
        );
        const rows = (Array.isArray(data.items) ? data.items : [])
          .map((item) => ({
            uid: item.uid,
            name: String(item.name ?? "").trim() || "Administrador sem nome",
            email: String(item.email ?? "").trim() || "—",
            sortName: String(item.name ?? "").trim().toLowerCase(),
            isCurrentUser: item.uid === currentUid,
          }))
          .sort((a, b) => a.sortName.localeCompare(b.sortName))
          .map((item, index) => ({
            uid: item.uid,
            code: String(index + 1),
            name: item.name,
            email: item.email,
            isCurrentUser: item.isCurrentUser,
          })) satisfies AdminItem[];
        if (active) setItems(rows);
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : "Não foi possível carregar os administradores.");
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
      [item.code, item.name, item.email].join(" ").toLowerCase().includes(s)
    );
  }, [items, search]);

  const removeAdmin = async (item: AdminItem) => {
    const ok = await confirm({
      title: `Remover "${item.name}"?`,
      description: "Este administrador perderá acesso ao painel. Essa ação não pode ser desfeita.",
      confirmLabel: "Remover",
      variant: "danger",
    });
    if (!ok) return;

    setDeletingUid(item.uid);
    try {
      await api.delete(`/api/admin/administradores/${item.uid}`);
      setItems((prev) => prev.filter((current) => current.uid !== item.uid));
      toast.success(`Administrador ${item.name} removido.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao excluir administrador.");
    } finally {
      setDeletingUid(null);
    }
  };

  return (
    <AdminShell
      title="Administradores"
      subtitle="Gerencie os usuários com acesso ao painel administrativo."
      actions={
        <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
          <div className="relative w-full md:w-72">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar administradores..."
              aria-label="Filtrar administradores"
              className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <Link href="/admin/administradores/novo" className={buttonStyles({ variant: "primary" })}>
            <Plus size={15} aria-hidden="true" /> Criar
          </Link>
        </div>
      }
    >
      {confirmDialog}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="min-w-[600px] w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
              <tr>
                {["#", "Nome", "E-mail", ""].map((h) => (
                  <th key={h} className={`px-5 py-3.5 text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400 ${h === "" ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <TableRowSkeleton cols={4} rows={4} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <EmptyState
                      icon={ShieldCheck}
                      title="Nenhum administrador encontrado"
                      description={search ? "Tente outros termos." : "Adicione o primeiro administrador."}
                      action={
                        !search
                          ? <Link href="/admin/administradores/novo" className={buttonStyles({ variant: "primary", size: "sm" })}><Plus size={13} /> Criar</Link>
                          : undefined
                      }
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.uid} className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-4 font-mono text-xs text-slate-400">{item.code}</td>
                    <td className="px-5 py-4 font-semibold text-slate-800 dark:text-slate-200">
                      <span className="flex items-center gap-2">
                        {item.name}
                        {item.isCurrentUser && <Badge tone="blue">você</Badge>}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-500 dark:text-slate-400">{item.email}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Link href={`/admin/administradores/${item.uid}`} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                          <Pencil size={13} aria-hidden="true" /> Editar
                        </Link>
                        {!item.isCurrentUser && (
                          <Button variant="danger" size="sm" loading={deletingUid === item.uid} onClick={() => void removeAdmin(item)}>
                            <Trash2 size={13} aria-hidden="true" /> Excluir
                          </Button>
                        )}
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
