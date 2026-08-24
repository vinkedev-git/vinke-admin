"use client";

import { useEffect, useMemo, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { dateFromUnknown } from "@/lib/dateValue";
import { auth } from "@/lib/firebase";
import { Modal } from "@/components/ui/Modal";

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
  code: string;
  title: string;
  productId: string;
  description: string;
  imageUrl: string;
  moderation: string;
  paymentType: string;
  source: "manual" | "eduzz";
  status: "ativo" | "inativo";
  price: string;
};

function formatCurrency(value: number | null | undefined, currency = "BRL") {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(Number(value));
}

function formatDate(value: unknown) {
  const parsed = dateFromUnknown(value);
  if (!parsed) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function StatusBadge({
  status,
  source,
}: {
  status: Plano["status"];
  source: Plano["source"];
}) {
  const statusClass =
    status === "inativo"
      ? "bg-slate-100 text-slate-600"
      : "bg-emerald-100 text-emerald-700";

  return (
    <div className="flex flex-wrap gap-2">
      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase ${statusClass}`}>
        {status || "ativo"}
      </span>
      <span
        className={
          source === "eduzz"
            ? "inline-flex rounded-full bg-violet-100 px-3 py-1 text-xs font-bold uppercase text-violet-700"
            : "inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase text-slate-600"
        }
      >
        {source === "eduzz" ? "Sincronizado" : "Manual"}
      </span>
    </div>
  );
}

export default function PlanosPage() {
  const [items, setItems] = useState<Plano[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Plano | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [form, setForm] = useState<PlanoForm>({
    code: "",
    title: "",
    productId: "",
    description: "",
    imageUrl: "",
    moderation: "",
    paymentType: "",
    source: "manual",
    status: "ativo",
    price: "",
  });

  const loadItems = async () => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Sessão inválida. Faça login novamente.");

      const res = await fetch("/api/admin/planos", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = (await res.json()) as { ok: boolean; error?: string; items?: Plano[] };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Não foi possível carregar os planos.");
      }
      setItems(data.items || []);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Erro ao carregar planos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return items;
    return items.filter((item) =>
      [
        item.code || "",
        item.title || "",
        item.productId || "",
        item.status || "",
        item.moderation || "",
        item.paymentType || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(s)
    );
  }, [items, search]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      code: String(items.length + 1),
      title: "",
      productId: "",
      description: "",
      imageUrl: "",
      moderation: "",
      paymentType: "",
      source: "manual",
      status: "ativo",
      price: "",
    });
    setErrorMsg(null);
    setSuccessMsg(null);
    setModalOpen(true);
  };

  const openEdit = (item: Plano) => {
    setEditing(item);
    setForm({
      code: item.code || "",
      title: item.title || "",
      productId: item.productId || "",
      description: item.description || "",
      imageUrl: item.imageUrl || "",
      moderation: item.moderation || "",
      paymentType: item.paymentType || "",
      source: item.source === "eduzz" ? "eduzz" : "manual",
      status: item.status || "ativo",
      price: item.price != null ? String(item.price) : "",
    });
    setErrorMsg(null);
    setSuccessMsg(null);
    setModalOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Sessão inválida. Faça login novamente.");

      const url = editing ? `/api/admin/planos/${editing.id}` : "/api/admin/planos";
      const method = editing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Não foi possível salvar o plano.");
      }

      setModalOpen(false);
      setSuccessMsg("Dados salvos com sucesso.");
      await loadItems();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Erro ao salvar plano.");
    } finally {
      setSaving(false);
    }
  };

  const syncEduzz = async () => {
    setSyncing(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Sessão inválida. Faça login novamente.");

      const res = await fetch("/api/admin/planos/sync-eduzz", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        created?: number;
        updated?: number;
        total?: number;
      };

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Não foi possível sincronizar os produtos da Eduzz.");
      }

      setSuccessMsg(
        `Sincronização concluída com sucesso: ${data.total ?? 0} produtos (${data.created ?? 0} novos, ${data.updated ?? 0} atualizados).`
      );
      await loadItems();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Erro ao sincronizar a Eduzz.");
    } finally {
      setSyncing(false);
    }
  };

  const remove = async (item: Plano) => {
    const ok = window.confirm(`Excluir o plano "${item.title}"?`);
    if (!ok) return;

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Sessão inválida. Faça login novamente.");

      const res = await fetch(`/api/admin/planos/${item.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Não foi possível excluir o plano.");
      }

      setSuccessMsg("Registro excluído com sucesso.");
      await loadItems();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Erro ao excluir plano.");
    }
  };

  return (
    <AdminShell
      title="Planos"
      subtitle="Cadastre manualmente ou sincronize os produtos da Eduzz para manter o catálogo igual ao MyEduzz."
      actions={
        <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
          <div className="relative w-full md:w-[340px]">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              ⌕
            </span>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar planos..."
              className="pl-11"
            />
          </div>
          <Button variant="secondary" onClick={() => void syncEduzz()} disabled={syncing}>
            {syncing ? "Sincronizando..." : "Sincronizar Eduzz"}
          </Button>
          <Button variant="primary" onClick={openCreate}>
            Criar
          </Button>
        </div>
      }
    >
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-5">
          <div className="text-2xl font-black text-slate-900">Planos</div>
          <div className="mt-1 text-sm text-slate-500">
            {loading ? "Carregando..." : `${filtered.length} planos`}
          </div>
          {errorMsg ? (
            <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMsg}
            </div>
          ) : null}
          {successMsg ? (
            <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {successMsg}
            </div>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="border-b bg-slate-100/80 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              <tr>
                <th className="px-5 py-4 text-left">Cód.</th>
                <th className="px-5 py-4 text-left">Criado em</th>
                <th className="px-5 py-4 text-left">Título</th>
                <th className="px-5 py-4 text-left">Status</th>
                <th className="px-5 py-4 text-right">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-500">
                    Nenhum plano encontrado.
                  </td>
                </tr>
              ) : null}

              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-5 text-lg font-semibold text-slate-600">{item.code || "—"}</td>
                  <td className="px-5 py-5 text-slate-500">{formatDate(item.createdAt)}</td>
                  <td className="px-5 py-5">
                    <div className="font-semibold text-slate-800">{item.title || "—"}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {item.productId || "Sem ID Eduzz"}
                      {item.price != null ? ` · ${formatCurrency(item.price, item.currency || "BRL")}` : ""}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.source === "eduzz" ? (
                        <span className="inline-flex rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-bold uppercase text-violet-700">
                          Sincronizado
                        </span>
                      ) : null}
                      {item.moderation ? (
                        <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-bold uppercase text-sky-700">
                          {item.moderation}
                        </span>
                      ) : null}
                      {item.paymentType ? (
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase text-slate-600">
                          {item.paymentType}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-5 py-5">
                    <StatusBadge status={item.status} source={item.source} />
                  </td>
                  <td className="px-5 py-5">
                    <div className="flex justify-end gap-2">
                      <Button variant="primary" size="sm" onClick={() => openEdit(item)}>
                        Editar
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => void remove(item)}>
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

      <Modal
        open={modalOpen}
        title={editing ? "Editar plano" : "Criar plano"}
        onClose={() => !saving && setModalOpen(false)}
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Código
              </div>
              <Input
                value={form.code}
                onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
              />
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Status
              </div>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    status: e.target.value as PlanoForm["status"],
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Origem
              </div>
              <select
                value={form.source}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    source: e.target.value === "eduzz" ? "eduzz" : "manual",
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="manual">Manual</option>
                <option value="eduzz">Eduzz</option>
              </select>
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Produto
            </div>
            <Input
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            />
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Descrição
            </div>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                ID produto/oferta Eduzz
              </div>
              <Input
                value={form.productId}
                onChange={(e) => setForm((prev) => ({ ...prev, productId: e.target.value }))}
                placeholder="Ex.: P567"
              />
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Valor
              </div>
              <Input
                value={form.price}
                onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                placeholder="0,00"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Moderação
              </div>
              <Input
                value={form.moderation}
                onChange={(e) => setForm((prev) => ({ ...prev, moderation: e.target.value }))}
                placeholder="Aprovado"
              />
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Tipo de cobrança
              </div>
              <Input
                value={form.paymentType}
                onChange={(e) => setForm((prev) => ({ ...prev, paymentType: e.target.value }))}
                placeholder="Pagamento único"
              />
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                URL da imagem
              </div>
              <Input
                value={form.imageUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, imageUrl: e.target.value }))}
                placeholder="https://..."
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
            Para vínculo automático com a compra, o campo <strong>ID produto/oferta Eduzz</strong> deve
            ser exatamente o mesmo código que chega no webhook da Eduzz.
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => void save()} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
