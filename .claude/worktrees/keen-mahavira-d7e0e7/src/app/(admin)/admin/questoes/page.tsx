"use client";

import AdminShell from "@/components/AdminShell";
import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useCallback, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import { Plus, RefreshCw, Copy, Trash2, Brain, X, ImageIcon } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/cn";
import { auth } from "@/lib/firebase";

// ─── tipos ───────────────────────────────────────────────────────────────────

type Option = { id: string; text?: string; imageUrl?: string | null };

type QBQuestion = {
  id: string;
  prompt?: string; prompt_text?: string; statement?: string; questionText?: string;
  explanation?: string; imageUrl?: string | null; options?: Option[];
  correctOptionId?: string; shuffleOptions?: boolean;
  examType?: string; prova_tipo?: string; examYear?: number | null; prova_ano?: number | string | null;
  examSource?: string; Prova?: string; level?: string; nivel?: string;
  themes?: string[] | string; isActive?: boolean;
  optionA_imageUrl?: string | null; optionB_imageUrl?: string | null;
  optionC_imageUrl?: string | null; optionD_imageUrl?: string | null; optionE_imageUrl?: string | null;
  optionA_text?: string; optionB_text?: string; optionC_text?: string;
  optionD_text?: string; optionE_text?: string;
};

type QuestionsResponse = {
  ok: boolean; error?: string; items?: QBQuestion[];
  pagination?: { page: number; pageSize: number; totalFiltered: number; totalPages: number };
  summary?: { total: number; commented: number; active: number; inactive: number };
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function hasAnyImage(q: QBQuestion) {
  return !!(q.imageUrl || (q.options ?? []).some((o) => !!o.imageUrl) ||
    q.optionA_imageUrl || q.optionB_imageUrl || q.optionC_imageUrl || q.optionD_imageUrl || q.optionE_imageUrl);
}

function isQuestionActive(q: QBQuestion) { return q.isActive !== false; }

function getEnunciado(q: QBQuestion) {
  const text = (q.prompt_text ?? q.prompt ?? q.questionText ?? q.statement ?? "").trim();
  return text.length ? text : "(sem enunciado)";
}

function getThemes(q: QBQuestion) {
  if (Array.isArray(q.themes)) return q.themes.map((t) => String(t ?? "").trim()).filter(Boolean);
  if (typeof q.themes === "string" && q.themes.trim()) return q.themes.split(/[;,]/).map((t) => t.trim()).filter(Boolean);
  return [];
}

function getExamType(q: QBQuestion) { return String(q.examType ?? q.prova_tipo ?? "").trim(); }
function getExamYear(q: QBQuestion) { const y = q.examYear ?? q.prova_ano ?? null; return y == null ? "" : String(y).trim(); }
function getExamLabel(q: QBQuestion) { return String(q.Prova ?? q.examSource ?? "").trim(); }

function sanitizeForCopy(q: QBQuestion) {
  const optionFallbacks = [
    { id: "A", text: q.optionA_text ?? "", imageUrl: q.optionA_imageUrl ?? "" },
    { id: "B", text: q.optionB_text ?? "", imageUrl: q.optionB_imageUrl ?? "" },
    { id: "C", text: q.optionC_text ?? "", imageUrl: q.optionC_imageUrl ?? "" },
    { id: "D", text: q.optionD_text ?? "", imageUrl: q.optionD_imageUrl ?? "" },
  ];
  if (q.optionE_text?.trim() || q.optionE_imageUrl || q.correctOptionId === "E")
    optionFallbacks.push({ id: "E", text: q.optionE_text ?? "", imageUrl: q.optionE_imageUrl ?? "" });
  return {
    prompt: (q.prompt_text ?? q.prompt ?? q.questionText ?? q.statement ?? "").toString().trim(),
    explanation: (q.explanation ?? "").toString(),
    imageUrl: (q.imageUrl ?? "").toString(),
    options: (Array.isArray(q.options) && q.options.length ? q.options : optionFallbacks)
      .map((o) => ({ id: o.id, text: (o.text ?? "").toString(), imageUrl: (o.imageUrl ?? "").toString() })),
    correctOptionId: q.correctOptionId ?? "A",
    shuffleOptions: q.shuffleOptions !== false,
    examType: getExamType(q), examYear: getExamYear(q) ? Number(getExamYear(q)) || getExamYear(q) : null,
    examSource: getExamLabel(q), themes: getThemes(q), isActive: isQuestionActive(q), duplicatedFrom: q.id,
  };
}

async function getAuthToken() {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Sessão inválida. Faça login novamente.");
  return token;
}

// ─── página ───────────────────────────────────────────────────────────────────

export default function BancoQuestoesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { dialog: confirmDialog, confirm } = useConfirm();

  // ── estado lido da URL ────────────────────────────────────────────────────
  const search      = searchParams.get("search") ?? "";
  const status      = (searchParams.get("status") as "todos" | "ativas" | "inativas") ?? "todos";
  const themeFilter = searchParams.get("tema") ?? "";
  const page        = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize    = ([20, 30, 50, 100].includes(Number(searchParams.get("pageSize") ?? "20"))
    ? Number(searchParams.get("pageSize") ?? "20")
    : 20) as 20 | 30 | 50 | 100;

  // ── estado local ─────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<QBQuestion[]>([]);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState({ total: 0, commented: 0, active: 0, inactive: 0 });
  const [openImages, setOpenImages] = useState(false);
  const [selected, setSelected] = useState<QBQuestion | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deferredSearch = useDeferredValue(search);

  // ── helper: atualiza URL sem navegar ─────────────────────────────────────
  const setParam = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v === null || v === "" || v === "todos" || v === "1" && k === "page") params.delete(k);
      else params.set(k, v);
    });
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, router, pathname]);

  // ── fetch ─────────────────────────────────────────────────────────────────
  const fetchPage = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAuthToken();
      const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (deferredSearch.trim()) query.set("search", deferredSearch.trim());
      if (status !== "todos") query.set("status", status);
      if (themeFilter) query.set("theme", themeFilter);

      const res = await fetch(`/api/admin/questions?${query.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
      });
      const data = (await res.json()) as QuestionsResponse;
      if (!res.ok || !data.ok) throw new Error(data.error || "Não foi possível carregar questões.");

      setItems(Array.isArray(data.items) ? data.items : []);
      setTotalFiltered(data.pagination?.totalFiltered ?? 0);
      setTotalPages(Math.max(data.pagination?.totalPages ?? 1, 1));
      setSummary({ total: data.summary?.total ?? 0, commented: data.summary?.commented ?? 0, active: data.summary?.active ?? 0, inactive: data.summary?.inactive ?? 0 });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar questões.");
    } finally {
      setLoading(false);
    }
  }, [deferredSearch, status, themeFilter, page, pageSize]);

  useEffect(() => { void fetchPage(); }, [fetchPage]);

  // ── ações ─────────────────────────────────────────────────────────────────

  const toggleActive = async (q: QBQuestion) => {
    const prev = isQuestionActive(q);
    const next = !prev;
    setTogglingId(q.id);
    setItems((old) => old.map((item) => (item.id === q.id ? { ...item, isActive: next } : item)));
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/admin/questions/${q.id}`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: next }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Não foi possível atualizar o status.");
      toast.success(`Questão ${next ? "ativada" : "desativada"}.`);
    } catch (error) {
      setItems((old) => old.map((item) => (item.id === q.id ? { ...item, isActive: prev } : item)));
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar.");
    } finally {
      setTogglingId(null);
    }
  };

  const duplicateQuestion = async (q: QBQuestion) => {
    const ok = await confirm({
      title: "Duplicar esta questão?",
      description: "Será criada uma cópia como nova questão no banco.",
      confirmLabel: "Duplicar",
      variant: "warning",
    });
    if (!ok) return;
    setDuplicatingId(q.id);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/admin/questions", {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(sanitizeForCopy(q)),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Não foi possível duplicar.");
      await fetchPage();
      toast.success("Questão duplicada com sucesso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível duplicar.");
    } finally {
      setDuplicatingId(null);
    }
  };

  const deleteQuestion = async (q: QBQuestion) => {
    const ok = await confirm({
      title: "Excluir esta questão?",
      description: `ID: ${q.id} — Essa ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;
    setDeletingId(q.id);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/admin/questions/${q.id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Não foi possível excluir.");
      await fetchPage();
      toast.success("Questão excluída.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir.");
    } finally {
      setDeletingId(null);
    }
  };

  const selectedImages = useMemo(() => {
    if (!selected) return [] as { label: string; url: string }[];
    const imgs: { label: string; url: string }[] = [];
    if (selected.imageUrl) imgs.push({ label: "Enunciado", url: selected.imageUrl });
    (selected.options ?? []).forEach((o) => { if (o.imageUrl) imgs.push({ label: `Alternativa ${o.id}`, url: o.imageUrl }); });
    if (!selected.options?.length) {
      if (selected.optionA_imageUrl) imgs.push({ label: "Alternativa A", url: selected.optionA_imageUrl });
      if (selected.optionB_imageUrl) imgs.push({ label: "Alternativa B", url: selected.optionB_imageUrl });
      if (selected.optionC_imageUrl) imgs.push({ label: "Alternativa C", url: selected.optionC_imageUrl });
      if (selected.optionD_imageUrl) imgs.push({ label: "Alternativa D", url: selected.optionD_imageUrl });
      if (selected.optionE_imageUrl) imgs.push({ label: "Alternativa E", url: selected.optionE_imageUrl });
    }
    return imgs;
  }, [selected]);

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <AdminShell
      title="Banco de Questões"
      subtitle="Busca em todo o banco, filtros e gestão completa das questões."
      actions={
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Button onClick={() => void fetchPage()} variant="secondary" size="sm">
            <RefreshCw size={14} aria-hidden="true" /> Atualizar
          </Button>
          <Link href="/admin/questoes/nova" className={buttonStyles({ variant: "primary", size: "sm" })}>
            <Plus size={14} aria-hidden="true" /> Nova questão
          </Link>
        </div>
      }
    >
      {confirmDialog}

      {/* KPIs */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Total cadastradas", value: summary.total, color: "text-slate-900 dark:text-slate-50" },
          { label: "Com comentário", value: summary.commented, color: "text-blue-700 dark:text-blue-400" },
          { label: "Ativas", value: summary.active, color: "text-emerald-700 dark:text-emerald-400" },
          { label: "Inativas", value: summary.inactive, color: "text-amber-700 dark:text-amber-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</div>
            <div className={cn("mt-2 text-2xl font-black", color)}>{value}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-1 items-end gap-3 lg:grid-cols-6">
          <div className="lg:col-span-3">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">Buscar</label>
            <input
              value={search}
              onChange={(e) => setParam({ search: e.target.value, page: null })}
              placeholder="Busca livre: ano:2017 prova:ME1 tema:pediatria nivel:R1 id:673"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
            />
            <div className="mt-1 text-[11px] text-slate-400">
              Combine filtros. Ex.: <span className="font-semibold">prova:ME1 ano:2017 tema:pediatria</span>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">Status</label>
            <select
              value={status}
              onChange={(e) => setParam({ status: e.target.value, page: null })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="todos">Todos</option>
              <option value="ativas">Ativas</option>
              <option value="inativas">Inativas</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">Por página</label>
            <select
              value={pageSize}
              onChange={(e) => setParam({ pageSize: e.target.value, page: null })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value={20}>20</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="flex flex-col gap-1 text-right text-sm text-slate-600 dark:text-slate-400">
            <span>Resultados: <strong>{totalFiltered}</strong></span>
            <span>Página <strong>{page}</strong> de <strong>{totalPages}</strong></span>
          </div>
        </div>

        {/* Filtros ativos */}
        {(themeFilter || search) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {themeFilter && (
              <span className="inline-flex items-center gap-1.5">
                <Badge tone="amber">Tema: {themeFilter}</Badge>
                <button
                  type="button"
                  onClick={() => setParam({ tema: null, page: null })}
                  className="flex items-center gap-0.5 text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  <X size={11} /> limpar
                </button>
              </span>
            )}
            {search && (
              <span className="inline-flex items-center gap-1.5">
                <Badge tone="blue">Busca: {search.length > 30 ? search.slice(0, 30) + "…" : search}</Badge>
                <button
                  type="button"
                  onClick={() => setParam({ search: null, page: null })}
                  className="flex items-center gap-0.5 text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  <X size={11} /> limpar
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="text-sm font-extrabold text-slate-900 dark:text-slate-50">Lista de questões</div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            A busca considera todo o banco, não apenas os itens desta página.
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
              <tr>
                {["Enunciado", "Metadados", "Temas", "Imagem", "Status", "Correta", ""].map((h) => (
                  <th key={h} className={`px-5 py-3.5 text-xs font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400 ${h === "" ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <TableRowSkeleton cols={7} rows={8} />
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={Brain}
                      title="Nenhuma questão encontrada"
                      description="Tente outros termos ou limpe os filtros ativos."
                      action={
                        <Link href="/admin/questoes/nova" className={buttonStyles({ variant: "primary", size: "sm" })}>
                          <Plus size={13} /> Nova questão
                        </Link>
                      }
                    />
                  </td>
                </tr>
              ) : (
                items.map((q) => {
                  const anyImg = hasAnyImage(q);
                  const isActive = isQuestionActive(q);
                  const themes = getThemes(q);
                  const examType = getExamType(q);
                  const examYear = getExamYear(q);
                  const examLabel = getExamLabel(q);
                  const levelLabel = String(q.level ?? q.nivel ?? "").trim();

                  return (
                    <tr key={q.id} className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="align-top px-5 py-4">
                        <div className="line-clamp-2 max-w-[340px] font-semibold text-slate-900 dark:text-slate-100">
                          {getEnunciado(q)}
                        </div>
                        <div className="mt-1 font-mono text-[11px] text-slate-400">ID: {q.id}</div>
                      </td>

                      <td className="align-top px-5 py-4">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {(examType || "—") + (examYear ? ` · ${examYear}` : "")}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{examLabel || "—"}</div>
                        <div className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{levelLabel ? `Nível ${levelLabel}` : "Sem nível"}</div>
                      </td>

                      <td className="align-top px-5 py-4">
                        {themes.length > 0 ? (
                          <div className="flex max-w-[220px] flex-wrap gap-1.5">
                            {themes.slice(0, 2).map((t) => (
                              <Badge
                                key={t}
                                tone={themeFilter === t ? "amber" : "slate"}
                                title="Clique para filtrar por este tema"
                                onClick={() => setParam({ tema: themeFilter === t ? null : t, page: null })}
                              >
                                {t}
                              </Badge>
                            ))}
                            {themes.length > 2 && (
                              <Badge tone="slate" title={themes.slice(2).join(", ")}>+{themes.length - 2}</Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      <td className="align-top px-5 py-4">
                        {anyImg ? (
                          <button
                            type="button"
                            onClick={() => { setSelected(q); setOpenImages(true); }}
                            className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900 dark:text-blue-200 dark:hover:bg-blue-800"
                          >
                            <ImageIcon size={11} /> Ver
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      <td className="align-top px-5 py-4">
                        <button
                          type="button"
                          onClick={() => void toggleActive(q)}
                          disabled={togglingId === q.id}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition",
                            isActive
                              ? "border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:border-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 dark:hover:bg-emerald-800"
                              : "border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200 dark:border-amber-800 dark:bg-amber-900 dark:text-amber-200 dark:hover:bg-amber-800",
                            togglingId === q.id && "cursor-wait opacity-60"
                          )}
                        >
                          <span className="text-[10px]">{isActive ? "●" : "○"}</span>
                          {isActive ? "Ativa" : "Inativa"}
                        </button>
                      </td>

                      <td className="align-top px-5 py-4">
                        <span className="font-extrabold text-slate-800 dark:text-slate-200">{q.correctOptionId ?? "—"}</span>
                      </td>

                      <td className="align-top px-5 py-4 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          <Link
                            href={`/admin/questoes/${q.id}`}
                            className={buttonStyles({ variant: "secondary", size: "sm" })}
                          >
                            Editar
                          </Link>
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={duplicatingId === q.id}
                            disabled={deletingId === q.id}
                            onClick={() => void duplicateQuestion(q)}
                          >
                            <Copy size={12} aria-hidden="true" /> Duplicar
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            loading={deletingId === q.id}
                            disabled={duplicatingId === q.id}
                            onClick={() => void deleteQuestion(q)}
                          >
                            <Trash2 size={12} aria-hidden="true" /> Excluir
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        <div className="border-t border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
          <Pagination
            page={page}
            pageSize={pageSize}
            total={totalFiltered}
            onPageChange={(p) => setParam({ page: String(p) })}
            onPageSizeChange={(s) => setParam({ pageSize: String(s), page: null })}
          />
        </div>
      </div>

      {/* Modal de imagens */}
      <Modal
        open={openImages}
        title={selected ? `Imagens da questão (${selected.id})` : "Imagens da questão"}
        size="lg"
        onClose={() => { setOpenImages(false); setSelected(null); }}
      >
        {!selected || selectedImages.length === 0 ? (
          <div className="text-sm text-slate-500">Nenhuma imagem encontrada.</div>
        ) : (
          <div className="space-y-5">
            {selectedImages.map((item) => (
              <div key={`${item.label}-${item.url}`} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                <div className="mb-2 text-xs font-extrabold text-slate-700 dark:text-slate-300">{item.label}</div>
                <img src={item.url} alt={item.label} className="max-h-[420px] w-full rounded-xl border bg-slate-50 object-contain dark:border-slate-700 dark:bg-slate-800" />
              </div>
            ))}
          </div>
        )}
      </Modal>
    </AdminShell>
  );
}
