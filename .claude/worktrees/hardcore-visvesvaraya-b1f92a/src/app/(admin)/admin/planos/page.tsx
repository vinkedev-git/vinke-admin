"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw } from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { SearchInput } from "@/components/ui/SearchInput";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { dateFromUnknown } from "@/lib/dateValue";
import { auth } from "@/lib/firebase";

type Plano = {
  id: string;
  code?: string | null;
  createdAt?: unknown;
  title?: string | null;
  productId?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  moderation?: string | null;
  paymentType?: string | null;
  source?: "manual" | "eduzz";
  status?: "ativo" | "inativo";
  price?: number | null;
  currency?: string | null;
  lastSyncedAt?: unknown;
};

type PlanoForm = {
  code: string; title: string; productId: string; description: string;
  imageUrl: string; moderation: string; paymentType: string;
  source: "manual" | "eduzz"; status: "ativo" | "inativo"; price: string;
};

function formatCurrency(value: number | null | undefined, currency = "BRL") {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(Number(value));
}

function formatDate(value: unknown) {
  const parsed = dateFromUnknown(value);
  if (!parsed) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(parsed);
}

const emptyForm = (): PlanoForm => ({
  code: "", title: "", productId: "", description: "", imageUrl: "",
  moderation: "", paymentType: "", source: "manual", status: "ativo", price: "",
});

export default function PlanosPage() {
  const [items, setItems] = useState<Plano[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Plano | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanoForm>(emptyForm());
  const { dialog: confirmDialog, confirm } = useConfirm();

  const authedFetch = useCallback(async (url: string, init?: RequestInit) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error("Sessão inválida. Faça login novamente.");
    return fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    });
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/admin/planos");
      const data = (await res.json()) as { ok: boolean; error?: string; items?: Plano[] };
      if (!res.ok || !data.ok) throw new Error(data.error || "Não foi possível carregar os planos.");
      setItems(data.items || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar planos.");
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => { void loadItems(); }, [loadItems]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return items;
    return items.filter((item) =>
      [item.code || "", item.title || "", item.productId || "", item.status || "", item.moderation || "", item.paymentType || ""]
        .join(" ").toLowerCase().includes(s)
    );
  }, [items, search]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm(), code: String(items.length + 1) });
    setModalOpen(true);
  };

  const openEdit = (item: Plano) => {
    setEditing(item);
    setForm({
      code: item.code || "", title: item.title || "", productId: item.productId || "",
      description: item.description || "", imageUrl: item.imageUrl || "",
      moderation: item.moderation || "", paymentType: item.paymentType || "",
      source: item.source === "eduzz" ? "eduzz" : "manual",
      status: item.status || "ativo",
      price: item.price != null ? String(item.price) : "",
    });
    setModalOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `/api/admin/planos/${editing.id}` : "/api/admin/planos";
      const method = editing ? "PATCH" : "POST";
      const res = await authedFetch(url, { method, body: JSON.stringify(form) });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Não foi possível salvar o plano.");
      toast.success(editing ? "Plano atualizado." : "Plano criado.");
      setModalOpen(false);
      await loadItems();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar plano.");
    } finally {
      setSaving(false);
    }
  };

  const syncEduzz = async () => {
    setSyncing(true);
    try {
      const res = await authedFetch("/api/admin/planos/sync-eduzz", { method: "POST" });
      const data = (await res.json()) as { ok: boolean; error?: string; created?: number; updated?: number; total?: number };
      if (!res.ok || !data.ok) throw new Error(data.error || "Não foi possível sincronizar.");
      toast.success(`Sincronização concluída: ${data.total ?? 0} produtos (${data.created ?? 0} novos, ${data.updated ?? 0} atualizados).`);
      await loadItems();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao sincronizar a Eduzz.");
    } finally {
      setSyncing(false);
    }
  };

  const remove = async (item: Plano) => {
    const ok = await confirm({
      title: `Excluir o plano "${item.title || item.code}"?`,
      description: "Essa ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;

    setDeletingId(item.id);
    try {
      const res = await authedFetch(`/api/admin/planos/${item.id}`, { method: "DELETE" });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Não foi possível excluir o plano.");
      toast.success("Plano excluído.");
      await loadItems();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao excluir plano.");
    } finally {
      setDeletingId(null);
    }
  };

  const setF = (patch: Partial<PlanoForm>) => setForm((prev) => ({ ...prev, ...patch }));

  return (
    <AdminShell
      title="Planos"
      subtitle="Cadastre manualmente ou sincronize os produtos da Eduzz para manter o catálogo atualizado."
      actions={
        <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Filtrar planos..." className="w-full md:w-72" />
          <Button variant="secondary" onClick={() => void syncEduzz()} loading={syncing}>
            <RefreshCw size={14} /> Sincronizar Eduzz
          </Button>
          <Button variant="primary" onClick={openCreate}>
            <Plus size={14} /> Criar plano
          </Button>
        </div>
      }
    >
      {confirmDialog}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
              <tr>
                {["Cód.", "Criado em", "Título", "Status", "Ações"].map((h) => (
                  <th key={h} className={`px-5 py-3.5 text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400 ${h === "Ações" ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <TableRowSkeleton cols={5} rows={5} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      title={search ? "Nenhum plano encontrado" : "Nenhum plano cadastrado"}
                      description={search ? "Tente outros termos de busca." : "Crie um plano manualmente ou sincronize com a Eduzz."}
                      action={!search ? <Button variant="primary" size="sm" onClick={openCreate}><Plus size={13} /> Criar plano</Button> : undefined}
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-4 font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">{item.code || "—"}</td>
                    <td className="px-5 py-4 text-xs text-slate-500 dark:text-slate-400">{formatDate(item.createdAt)}</td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">{item.title || "—"}</div>
                      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {item.productId || "Sem ID Eduzz"}
                        {item.price != null ? ` · ${formatCurrency(item.price, item.currency || "BRL")}` : ""}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {item.source === "eduzz" && <Badge tone="indigo">Sincronizado</Badge>}
                        {item.moderation && <Badge tone="blue">{item.moderation}</Badge>}
                        {item.paymentType && <Badge tone="slate">{item.paymentType}</Badge>}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={item.status === "inativo" ? "amber" : "emerald"}>
                        {item.status === "inativo" ? "Inativo" : "Ativo"}
                      </Badge>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => openEdit(item)}>Editar</Button>
                        <Button variant="danger" size="sm" loading={deletingId === item.id} onClick={() => void remove(item)}>Excluir</Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={modalOpen}
        title={editing ? "Editar plano" : "Criar plano"}
        size="md"
        onClose={() => !saving && setModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
            <Button variant="primary" onClick={() => void save()} loading={saving}>Salvar</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Código</label>
              <Input value={form.code} onChange={(e) => setF({ code: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Status</label>
              <select value={form.status} onChange={(e) => setF({ status: e.target.value as PlanoForm["status"] })}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Origem</label>
              <select value={form.source} onChange={(e) => setF({ source: e.target.value === "eduzz" ? "eduzz" : "manual" })}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                <option value="manual">Manual</option>
                <option value="eduzz">Eduzz</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Produto</label>
            <Input value={form.title} onChange={(e) => setF({ title: e.target.value })} />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Descrição</label>
            <Textarea value={form.description} onChange={(e) => setF({ description: e.target.value })} rows={3} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">ID produto/oferta Eduzz</label>
              <Input value={form.productId} onChange={(e) => setF({ productId: e.target.value })} placeholder="Ex.: P567" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Valor</label>
              <Input value={form.price} onChange={(e) => setF({ price: e.target.value })} placeholder="0,00" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Moderação</label>
              <Input value={form.moderation} onChange={(e) => setF({ moderation: e.target.value })} placeholder="Aprovado" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Tipo de cobrança</label>
              <Input value={form.paymentType} onChange={(e) => setF({ paymentType: e.target.value })} placeholder="Pagamento único" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">URL da imagem</label>
              <Input value={form.imageUrl} onChange={(e) => setF({ imageUrl: e.target.value })} placeholder="https://..." />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            Para vínculo automático com a compra, o campo <strong>ID produto/oferta Eduzz</strong> deve ser exatamente o mesmo código que chega no webhook da Eduzz.
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
