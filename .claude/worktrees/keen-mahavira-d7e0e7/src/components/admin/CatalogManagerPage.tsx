"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2, FileText, BookOpen, Tags } from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { dateFromUnknown } from "@/lib/dateValue";
import { auth } from "@/lib/firebase";

type EntityType = "provas" | "niveis" | "temas";

type CatalogDoc = {
  id: string;
  code: string;
  title: string;
  status: "ativo" | "inativo";
  createdAt?: unknown;
  updatedAt?: unknown;
  levelId?: string | null;
  levelLabel?: string | null;
};

type CatalogForm = {
  code: string;
  title: string;
  status: "ativo" | "inativo";
  levelId: string;
};

const ENTITY_ICONS = {
  provas: FileText,
  niveis: BookOpen,
  temas: Tags,
} as const;

type CatalogManagerPageProps = {
  entity: EntityType;
  title: string;
  singularLabel: string;
  subtitle: string;
  searchPlaceholder: string;
  createLabel: string;
  emptyMessage: string;
  showLevelColumn?: boolean;
};

type LevelOption = {
  id: string;
  title: string;
  status: "ativo" | "inativo";
};

function formatDate(value?: unknown) {
  const parsed = dateFromUnknown(value);
  if (!parsed) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(parsed);
}

export default function CatalogManagerPage({
  entity,
  title,
  singularLabel,
  subtitle,
  searchPlaceholder,
  createLabel,
  emptyMessage,
  showLevelColumn = false,
}: CatalogManagerPageProps) {
  const emptyIcon = ENTITY_ICONS[entity];
  const [items, setItems] = useState<CatalogDoc[]>([]);
  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogDoc | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState<CatalogForm>({ code: "", title: "", status: "ativo", levelId: "" });
  const { dialog: confirmDialog, confirm } = useConfirm();

  const authedRequest = useCallback(async (url: string, init?: RequestInit) => {
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
      const res = await authedRequest(`/api/admin/catalog/${entity}`);
      const data = (await res.json()) as { ok: boolean; error?: string; items?: CatalogDoc[] };
      if (!res.ok || !data.ok) throw new Error(data.error || "Não foi possível carregar os dados.");
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, [authedRequest, entity]);

  const loadLevels = useCallback(async () => {
    if (entity !== "temas") return;
    try {
      const res = await authedRequest("/api/admin/catalog/niveis");
      const data = (await res.json()) as { ok: boolean; items?: Array<{ id: string; title?: string; status?: string }> };
      const rows = (Array.isArray(data.items) ? data.items : []).map((item) => ({
        id: item.id,
        title: String(item.title ?? ""),
        status: item.status === "inativo" ? ("inativo" as const) : ("ativo" as const),
      }));
      setLevels(rows.filter((item) => item.status === "ativo"));
    } catch {
      // silently fail — levels not critical if already loaded
    }
  }, [authedRequest, entity]);

  useEffect(() => {
    void loadItems();
    void loadLevels();
  }, [loadItems, loadLevels]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return items;
    return items.filter((item) =>
      [item.code, item.title, item.status, item.levelLabel ?? "", formatDate(item.createdAt)].join(" ").toLowerCase().includes(s)
    );
  }, [items, search]);

  const nextCode = useMemo(() => {
    const nums = items.map((item) => Number(item.code)).filter((v) => Number.isFinite(v));
    return nums.length ? String(Math.max(...nums) + 1) : "1";
  }, [items]);

  const openCreate = () => {
    setEditing(null);
    setFormError(null);
    setForm({ code: nextCode, title: "", status: "ativo", levelId: levels[0]?.id ?? "" });
    setModalOpen(true);
  };

  const openEdit = (item: CatalogDoc) => {
    setEditing(item);
    setFormError(null);
    setForm({ code: item.code, title: item.title, status: item.status, levelId: item.levelId ?? "" });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditing(null);
    setFormError(null);
  };

  const saveItem = async () => {
    const code = form.code.trim();
    const titleValue = form.title.trim();
    if (!code || !titleValue) { setFormError("Código e título são obrigatórios."); return; }
    if (items.some((item) => item.code === code && item.id !== editing?.id)) {
      setFormError("Já existe um registro com esse código."); return;
    }
    const level = entity === "temas" ? levels.find((item) => item.id === form.levelId) : null;
    if (entity === "temas" && !level) { setFormError("Selecione um nível para o tema."); return; }

    setSaving(true);
    setFormError(null);
    try {
      const payload = { code, title: titleValue, status: form.status, levelId: level?.id ?? null, levelLabel: level?.title ?? null };
      if (editing) {
        const res = await authedRequest(`/api/admin/catalog/${entity}/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        const data = (await res.json()) as { ok: boolean; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error || "Não foi possível atualizar.");
      } else {
        const res = await authedRequest(`/api/admin/catalog/${entity}`, { method: "POST", body: JSON.stringify(payload) });
        const data = (await res.json()) as { ok: boolean; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error || "Não foi possível criar.");
      }
      await loadItems();
      if (entity === "temas") await loadLevels();
      toast.success(editing ? `${singularLabel} atualizado.` : `${singularLabel} criado.`);
      setModalOpen(false);
      setEditing(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  const removeItem = async (item: CatalogDoc) => {
    const ok = await confirm({
      title: `Excluir "${item.title}"?`,
      description: "Essa ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;

    setDeletingId(item.id);
    try {
      const res = await authedRequest(`/api/admin/catalog/${entity}/${item.id}`, { method: "DELETE" });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Não foi possível excluir.");
      await loadItems();
      if (entity === "niveis" || entity === "temas") await loadLevels();
      toast.success(`${singularLabel} excluído.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao excluir.");
    } finally {
      setDeletingId(null);
    }
  };

  const canCreate = entity !== "temas" || levels.length > 0;
  const colSpan = showLevelColumn ? 6 : 5;

  return (
    <AdminShell
      title={title}
      subtitle={subtitle}
      actions={
        <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
          <div className="relative w-full md:w-72">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={`Filtrar ${title.toLowerCase()}`}
              className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <Button variant="primary" onClick={openCreate} disabled={!canCreate}>
            <Plus size={15} aria-hidden="true" /> {createLabel}
          </Button>
        </div>
      }
    >
      {confirmDialog}

      {entity === "temas" && levels.length === 0 && !loading && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Cadastre pelo menos um nível ativo antes de criar temas.
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
              <tr>
                <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Cód.</th>
                <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Criado em</th>
                <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Título</th>
                {showLevelColumn && <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Nível</th>}
                <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Status</th>
                <th className="px-5 py-3.5 text-right text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <TableRowSkeleton cols={colSpan} rows={5} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={colSpan}>
                    <EmptyState
                      icon={emptyIcon}
                      title={search ? "Nenhum resultado encontrado" : emptyMessage}
                      description={search ? "Tente outros termos de busca." : undefined}
                      action={
                        !search && canCreate
                          ? <Button variant="primary" size="sm" onClick={openCreate}><Plus size={13} /> {createLabel}</Button>
                          : undefined
                      }
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-4 font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">{item.code}</td>
                    <td className="px-5 py-4 text-xs text-slate-500 dark:text-slate-400">{formatDate(item.createdAt)}</td>
                    <td className="px-5 py-4 font-semibold text-slate-800 dark:text-slate-200">{item.title}</td>
                    {showLevelColumn && <td className="px-5 py-4 text-slate-500 dark:text-slate-400">{item.levelLabel || "—"}</td>}
                    <td className="px-5 py-4">
                      <Badge tone={item.status === "ativo" ? "emerald" : "amber"}>{item.status}</Badge>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => openEdit(item)}>
                          <Pencil size={13} aria-hidden="true" /> Editar
                        </Button>
                        <Button variant="danger" size="sm" loading={deletingId === item.id} onClick={() => void removeItem(item)}>
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

      {/* Modal de criar/editar */}
      <Modal
        open={modalOpen}
        title={editing ? `Editar ${singularLabel}` : createLabel}
        size="md"
        onClose={closeModal}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={saving}>Cancelar</Button>
            <Button variant="primary" onClick={() => void saveItem()} loading={saving}>Salvar</Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
              {formError}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Código</label>
              <input
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as CatalogForm["status"] }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Título</label>
            <input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          {entity === "temas" && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Nível</label>
              <select
                value={form.levelId}
                onChange={(e) => setForm((p) => ({ ...p, levelId: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">Selecione um nível</option>
                {levels.map((level) => (
                  <option key={level.id} value={level.id}>{level.title}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </Modal>
    </AdminShell>
  );
}
