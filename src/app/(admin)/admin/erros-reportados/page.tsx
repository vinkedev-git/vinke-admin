"use client";

import AdminShell from "@/components/AdminShell";
import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/apiClient";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SearchInput } from "@/components/ui/SearchInput";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { Modal } from "@/components/ui/Modal";

type ReportStatus = "aberto" | "resolvido" | "ignorado";

type Report = {
  id: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  status?: ReportStatus | string;
  message?: string;
  mensagem?: string;
  details?: string;
  questionId?: string;
  questaoId?: string;
  attemptId?: string;
  sessionId?: string;
  uid?: string;
  userId?: string;
  userUid?: string;
  alunoId?: string;
  alunoNome?: string;
  codigo?: string;
  questaoPergunta?: string;
};

type QuestionMini = { id: string; prompt?: string; questionText?: string; statement?: string };

const PAGE_SIZE = 300;

function getReportStatus(r: Report): ReportStatus {
  const s = String(r.status || "").toLowerCase();
  if (s === "resolvido") return "resolvido";
  if (s === "ignorado") return "ignorado";
  return "aberto";
}

function getUid(r: Report) { return r.uid || r.userId || r.userUid || r.alunoId || ""; }
function getQuestionId(r: Report) { return r.questionId || r.questaoId || ""; }
function getMessage(r: Report) { return (r.message || r.mensagem || r.details || "").trim(); }

function toDateLabel(ts: unknown) {
  try {
    const withToDate =
      typeof ts === "object" && ts !== null && "toDate" in ts &&
      typeof (ts as { toDate?: unknown }).toDate === "function"
        ? (ts as { toDate: () => Date })
        : null;
    const d = withToDate ? withToDate.toDate() : null;
    if (!d) return "—";
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(d);
  } catch { return "—"; }
}

function getQuestionText(q?: QuestionMini | null) {
  const t = (q?.prompt ?? q?.questionText ?? q?.statement ?? "").trim();
  return t.length ? t : "(sem enunciado)";
}

function clip(s: string, max = 120) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  if (!t) return "—";
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

const STATUS_TONE: Record<ReportStatus, "amber" | "green" | "slate"> = {
  aberto: "amber", resolvido: "green", ignorado: "slate",
};
const STATUS_LABEL: Record<ReportStatus, string> = {
  aberto: "Aberto", resolvido: "Resolvido", ignorado: "Ignorado",
};

export default function ErrosReportadosPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Report[]>([]);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [statusFilter, setStatusFilter] = useState<"todos" | ReportStatus>("aberto");
  const [questionCache, setQuestionCache] = useState<Record<string, QuestionMini>>({});
  const [userCache, setUserCache] = useState<Record<string, { name?: string; email?: string }>>({});
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Report | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchFirst = async () => {
    setLoading(true);
    try {
      const data = await api.get<{
        items?: Report[];
        questionCache?: Record<string, QuestionMini>;
        userCache?: Record<string, { name?: string; email?: string }>;
      }>("/api/admin/erros-reportados");
      setItems(Array.isArray(data.items) ? data.items : []);
      setQuestionCache(data.questionCache && typeof data.questionCache === "object" ? data.questionCache : {});
      setUserCache(data.userCache && typeof data.userCache === "object" ? data.userCache : {});
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar erros reportados.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchFirst(); }, []);

  const filtered = useMemo(() => {
    const s = deferredSearch.trim().toLowerCase();
    return items.filter((r) => {
      const st = getReportStatus(r);
      if (statusFilter !== "todos" && st !== statusFilter) return false;
      if (!s) return true;
      const uid = getUid(r).toLowerCase();
      const qid = getQuestionId(r).toLowerCase();
      const msg = getMessage(r).toLowerCase();
      const alunoNome = (r.alunoNome || "").toLowerCase();
      const cachedQ = questionCache[getQuestionId(r)];
      const qText = cachedQ ? getQuestionText(cachedQ).toLowerCase() : "";
      return uid.includes(s) || alunoNome.includes(s) || qid.includes(s) || msg.includes(s) || qText.includes(s) || (r.questaoPergunta || "").toLowerCase().includes(s);
    });
  }, [items, deferredSearch, statusFilter, questionCache]);

  const counts = useMemo(() => ({
    aberto: items.filter((x) => getReportStatus(x) === "aberto").length,
    resolvido: items.filter((x) => getReportStatus(x) === "resolvido").length,
    ignorado: items.filter((x) => getReportStatus(x) === "ignorado").length,
  }), [items]);

  const openModal = (r: Report) => { setSelected(r); setOpen(true); };

  const setStatus = async (r: Report, nextStatus: ReportStatus) => {
    setUpdatingId(r.id);
    setItems((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: nextStatus } : x)));
    // atualiza também o modal se estiver aberto
    setSelected((prev) => prev?.id === r.id ? { ...prev, status: nextStatus } : prev);
    try {
      await api.patch(`/api/admin/erros-reportados/${r.id}`, { status: nextStatus });
      toast.success(`Status atualizado: ${STATUS_LABEL[nextStatus]}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o status.");
      await fetchFirst();
    } finally {
      setUpdatingId(null);
    }
  };

  const StatusBadge = ({ r }: { r: Report }) => {
    const st = getReportStatus(r);
    return <Badge tone={STATUS_TONE[st]}>{STATUS_LABEL[st]}</Badge>;
  };

  return (
    <AdminShell
      title="Erros reportados"
      subtitle="Revisão de erros enviados pelos alunos no app."
      actions={
        <Button variant="secondary" size="sm" onClick={() => void fetchFirst()} loading={loading}>
          <RefreshCw size={14} /> Atualizar
        </Button>
      }
    >
      {/* KPIs */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total carregados</div>
          <div className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-50">{items.length}</div>
          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">Limite: {PAGE_SIZE}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Exibidos (após filtros)</div>
          <div className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-50">{filtered.length}</div>
          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">Status + busca</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Resumo rápido</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="amber">{counts.aberto} abertos</Badge>
            <Badge tone="green">{counts.resolvido} resolvidos</Badge>
            <Badge tone="slate">{counts.ignorado} ignorados</Badge>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">Buscar</label>
            <SearchInput value={search} onChange={setSearch} placeholder="UID, aluno, mensagem, questionId, trecho do enunciado..." />
          </div>
          <div className="w-full lg:w-48">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "todos" | ReportStatus)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="todos">Todos</option>
              <option value="aberto">Abertos</option>
              <option value="resolvido">Resolvidos</option>
              <option value="ignorado">Ignorados</option>
            </select>
          </div>
          <div className="flex items-end pb-0.5 lg:pt-6">
            <Badge tone="blue">{filtered.length} exibidos</Badge>
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="text-sm font-extrabold text-slate-900 dark:text-slate-50">Lista</div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Clique em "Ver" para abrir os detalhes.</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
              <tr>
                {["Data", "Aluno", "Questão", "Mensagem", "Status", "Ações"].map((h) => (
                  <th key={h} className={`px-5 py-3.5 text-xs font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400 ${h === "Ações" ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <TableRowSkeleton cols={6} rows={6} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="px-5 py-8 text-sm text-slate-500 dark:text-slate-400" colSpan={6}>
                    Nenhum erro encontrado com esses filtros.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const uid = getUid(r);
                  const qId = getQuestionId(r);
                  const userMini = uid ? userCache[uid] : undefined;
                  const alunoNome = (r.alunoNome || userMini?.name || "").trim();
                  const qMini = qId ? questionCache[qId] : undefined;
                  const qText = qMini ? getQuestionText(qMini) : r.questaoPergunta?.trim() ?? "";
                  const isUpdating = updatingId === r.id;
                  const st = getReportStatus(r);

                  return (
                    <tr key={r.id} className="transition hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{toDateLabel(r.createdAt)}</div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">ID: {r.id}{r.codigo ? ` · ${r.codigo}` : ""}</div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{alunoNome || (uid ? "Aluno" : "—")}</div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{uid ? `UID: ${uid}` : "—"}</div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="line-clamp-2 font-semibold text-slate-900 dark:text-slate-100">
                          {qText ? clip(qText, 120) : qId ? "(carregando…)" : "—"}
                        </div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{qId ? `QID: ${qId}` : "—"}</div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="line-clamp-2 text-slate-700 dark:text-slate-300">{clip(getMessage(r), 140)}</div>
                      </td>
                      <td className="px-5 py-4"><StatusBadge r={r} /></td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          <Button variant="secondary" size="sm" onClick={() => openModal(r)}>Ver</Button>
                          {st !== "resolvido" ? (
                            <Button variant="primary" size="sm" loading={isUpdating} onClick={() => void setStatus(r, "resolvido")}>Resolver</Button>
                          ) : (
                            <Button variant="secondary" size="sm" loading={isUpdating} onClick={() => void setStatus(r, "aberto")}>Reabrir</Button>
                          )}
                          {st !== "ignorado" ? (
                            <Button variant="secondary" size="sm" loading={isUpdating} onClick={() => void setStatus(r, "ignorado")}>Ignorar</Button>
                          ) : (
                            <Button variant="secondary" size="sm" loading={isUpdating} onClick={() => void setStatus(r, "aberto")}>Reabrir</Button>
                          )}
                          {qId && (
                            <Link href={`/admin/questoes/${qId}`} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                              Ir para questão
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal detalhes */}
      <Modal
        open={open}
        title={selected ? `Detalhes do erro (${selected.id})` : "Detalhes do erro"}
        size="lg"
        onClose={() => { setOpen(false); setSelected(null); }}
      >
        {!selected ? (
          <div className="text-sm text-slate-500">Nenhum item selecionado.</div>
        ) : (() => {
          const st = getReportStatus(selected);
          const uid = getUid(selected);
          const qId = getQuestionId(selected);
          const userMini = uid ? userCache[uid] : undefined;
          const alunoNome = (selected.alunoNome || userMini?.name || "").trim();
          const qMini = qId ? questionCache[qId] : undefined;
          const qText = qMini ? getQuestionText(qMini) : selected.questaoPergunta?.trim() ?? "";
          const isUpdating = updatingId === selected.id;

          return (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 lg:col-span-2">
                  <div className="mb-2 text-xs font-extrabold text-slate-700 dark:text-slate-300">Mensagem</div>
                  <div className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">{getMessage(selected) || "—"}</div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                  <div className="mb-2 text-xs font-extrabold text-slate-700 dark:text-slate-300">Status</div>
                  <div className="flex items-center gap-2">
                    <Badge tone={STATUS_TONE[st]}>{STATUS_LABEL[st]}</Badge>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Criado: {toDateLabel(selected.createdAt)}<br />
                      Atualizado: {toDateLabel(selected.updatedAt)}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" loading={isUpdating} onClick={() => void setStatus(selected, "aberto")}>Reabrir</Button>
                    <Button variant="primary" size="sm" loading={isUpdating} onClick={() => void setStatus(selected, "resolvido")}>Resolver</Button>
                    <Button variant="secondary" size="sm" loading={isUpdating} onClick={() => void setStatus(selected, "ignorado")}>Ignorar</Button>
                    {qId && (
                      <Link href={`/admin/questoes/${qId}`} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                        Abrir questão
                      </Link>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                  <div className="mb-2 text-xs font-extrabold text-slate-700 dark:text-slate-300">Referências</div>
                  <div className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
                    <div><b>Código:</b> {selected.codigo || "—"}</div>
                    <div><b>questionId:</b> {qId || "—"}</div>
                    <div><b>sessionId:</b> {selected.sessionId || "—"}</div>
                    <div><b>attemptId:</b> {selected.attemptId || "—"}</div>
                    <div><b>uid:</b> {uid || "—"}</div>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                  <div className="mb-2 text-xs font-extrabold text-slate-700 dark:text-slate-300">Aluno</div>
                  <div className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
                    <div><b>Nome:</b> {alunoNome || "—"}</div>
                    <div><b>Email:</b> {userMini?.email || "—"}</div>
                  </div>
                </div>
              </div>

              {qId && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                  <div className="mb-2 text-xs font-extrabold text-slate-700 dark:text-slate-300">Enunciado (preview)</div>
                  <div className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">{qText || "(carregando…)"}</div>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>
    </AdminShell>
  );
}
