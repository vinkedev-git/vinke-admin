"use client";

import AdminShell from "@/components/AdminShell";
import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/apiClient";
import { buttonStyles } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";

type ReportStatus = "aberto" | "resolvido" | "ignorado";

type Report = {
  id: string;
  createdAt?: unknown;
  updatedAt?: unknown;

  // status padronizado
  status?: ReportStatus | string;

  // conteúdo
  message?: string;
  mensagem?: string; // fallback (caso exista legado)
  details?: string;

  // refs (podem variar)
  questionId?: string;
  questaoId?: string; // fallback (legado)
  attemptId?: string;
  sessionId?: string;

  // user refs (podem variar)
  uid?: string;
  userId?: string;
  userUid?: string;
  alunoId?: string; // fallback (legado)
  alunoNome?: string; // às vezes já vem pronto

  // extras possíveis
  codigo?: string; // seu código numérico
  questaoPergunta?: string; // às vezes vem um texto já salvo
};

type QuestionMini = {
  id: string;
  prompt?: string;
  questionText?: string;
  statement?: string;
};

const PAGE_SIZE = 300;

function cn(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

// ---------- Helpers (robustos para campos legados) ----------

function getReportStatus(r: Report): ReportStatus {
  const s = String(r.status || "").toLowerCase();
  if (s === "resolvido") return "resolvido";
  if (s === "ignorado") return "ignorado";
  return "aberto";
}

function getUid(r: Report) {
  return r.uid || r.userId || r.userUid || r.alunoId || "";
}

function getQuestionId(r: Report) {
  return r.questionId || r.questaoId || "";
}

function getMessage(r: Report) {
  return (r.message || r.mensagem || r.details || "").trim();
}

function toDateLabel(ts: unknown) {
  try {
    const withToDate =
      typeof ts === "object" &&
      ts !== null &&
      "toDate" in ts &&
      typeof (ts as { toDate?: unknown }).toDate === "function"
        ? (ts as { toDate: () => Date })
        : null;
    const d = withToDate ? withToDate.toDate() : null;
    if (!d) return "—";
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(d);
  } catch {
    return "—";
  }
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

// -----------------------------------------------------------

export default function ErrosReportadosPage() {
  const [loading, setLoading] = useState(true);

  const [items, setItems] = useState<Report[]>([]);

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [statusFilter, setStatusFilter] = useState<"todos" | ReportStatus>("aberto");

  // cache: users + questions
  const [questionCache, setQuestionCache] = useState<Record<string, QuestionMini>>({});
  const [userCache, setUserCache] = useState<Record<string, { name?: string; email?: string }>>({});

  // modal
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Report | null>(null);

  // action loading
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
      setQuestionCache(
        data.questionCache && typeof data.questionCache === "object" ? data.questionCache : {}
      );
      setUserCache(data.userCache && typeof data.userCache === "object" ? data.userCache : {});
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível carregar erros reportados.");
    } finally {
      setLoading(false);
    }
  };

  const fetchNext = async () => {};
  const fetchPrev = async () => {};

  useEffect(() => {
    void fetchFirst();
  }, []);

  const filtered = useMemo(() => {
    const s = deferredSearch.trim().toLowerCase();

    return items.filter((r) => {
      const st = getReportStatus(r);
      const okStatus = statusFilter === "todos" ? true : st === statusFilter;
      if (!okStatus) return false;

      if (!s) return true;

      const uid = getUid(r).toLowerCase();
      const qid = getQuestionId(r).toLowerCase();
      const msg = getMessage(r).toLowerCase();
      const alunoNome = (r.alunoNome || "").toLowerCase();

      const cachedQ = questionCache[getQuestionId(r)];
      const qText = cachedQ ? getQuestionText(cachedQ).toLowerCase() : "";
      const qPreviewSaved = (r.questaoPergunta || "").toLowerCase();

      return (
        uid.includes(s) ||
        alunoNome.includes(s) ||
        qid.includes(s) ||
        msg.includes(s) ||
        qText.includes(s) ||
        qPreviewSaved.includes(s)
      );
    });
  }, [items, deferredSearch, statusFilter, questionCache]);

  const hasNextPage = false;

  const openModal = (r: Report) => {
    setSelected(r);
    setOpen(true);
  };

  const setStatus = async (r: Report, nextStatus: ReportStatus) => {
    setUpdatingId(r.id);

    // otimista
    setItems((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: nextStatus } : x)));

    try {
      await api.patch(`/api/admin/erros-reportados/${r.id}`, { status: nextStatus });
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "Não foi possível atualizar o status.");
      await fetchFirst(); // rollback seguro
    } finally {
      setUpdatingId(null);
    }
  };

  const counts = useMemo(() => {
    const aberto = items.filter((x) => getReportStatus(x) === "aberto").length;
    const resolvido = items.filter((x) => getReportStatus(x) === "resolvido").length;
    const ignorado = items.filter((x) => getReportStatus(x) === "ignorado").length;
    return { aberto, resolvido, ignorado };
  }, [items]);

  return (
    <AdminShell
      title="Erros reportados"
      subtitle="Revisão de erros enviados pelos alunos no app."
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={fetchFirst}
            className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Atualizar
          </button>
        </div>
      }
    >
      {/* Cards topo */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs font-semibold text-slate-500">Carregados nesta página</div>
          <div className="mt-2 text-2xl font-black text-slate-900">{items.length}</div>
          <div className="mt-1 text-sm text-slate-500">Limite por página: {PAGE_SIZE}</div>
        </div>

        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs font-semibold text-slate-500">Exibidos (após filtros)</div>
          <div className="mt-2 text-2xl font-black text-slate-900">{filtered.length}</div>
          <div className="mt-1 text-sm text-slate-500">Status + busca</div>
        </div>

        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs font-semibold text-slate-500">Resumo rápido</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="amber">{counts.aberto} abertos</Badge>
            <Badge tone="green">{counts.resolvido} resolvidos</Badge>
            <Badge tone="slate">{counts.ignorado} ignorados</Badge>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border bg-white p-4 mb-4">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 items-end">
          <div className="lg:col-span-3">
            <div className="text-xs font-semibold text-slate-600 mb-1">Buscar</div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="UID, aluno, mensagem, questionId, trecho do enunciado..."
              className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div className="lg:col-span-1">
            <div className="text-xs font-semibold text-slate-600 mb-1">Status</div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "todos" | ReportStatus)}
              className="w-full rounded-xl border px-4 py-3 text-sm bg-white"
            >
              <option value="todos">Todos</option>
              <option value="aberto">Abertos</option>
              <option value="resolvido">Resolvidos</option>
              <option value="ignorado">Ignorados</option>
            </select>
          </div>

        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone="blue">{filtered.length} exibidos</Badge>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-5 py-4 border-b">
          <div className="text-sm font-extrabold text-slate-900">Lista</div>
          <div className="text-xs text-slate-500 mt-0.5">Clique em “Ver” para abrir os detalhes.</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="text-xs uppercase text-slate-500 border-b bg-slate-50/60">
              <tr>
                <th className="text-left px-5 py-3">Data</th>
                <th className="text-left px-5 py-3">Aluno</th>
                <th className="text-left px-5 py-3">Questão</th>
                <th className="text-left px-5 py-3">Mensagem</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-right px-5 py-3">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td className="px-5 py-6 text-slate-500" colSpan={6}>
                    Carregando…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="px-5 py-6 text-slate-500" colSpan={6}>
                    Nenhum erro encontrado com esses filtros.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const st = getReportStatus(r);
                  const uid = getUid(r);
                  const qId = getQuestionId(r);

                  const userMini = uid ? userCache[uid] : undefined;
                  const alunoNome = (r.alunoNome || userMini?.name || "").trim();

                  const qMini = qId ? questionCache[qId] : undefined;
                  const qText =
                    qMini ? getQuestionText(qMini) : r.questaoPergunta?.trim() ? r.questaoPergunta!.trim() : "";

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900">{toDateLabel(r.createdAt)}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          ID: {r.id}
                          {r.codigo ? ` • Código: ${r.codigo}` : ""}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900">
                          {alunoNome ? alunoNome : uid ? "Aluno" : "—"}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">{uid ? `UID: ${uid}` : "—"}</div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900 line-clamp-2">
                          {qText ? clip(qText, 120) : qId ? "(carregando…)" : "—"}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">{qId ? `QID: ${qId}` : "—"}</div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="text-slate-700 line-clamp-2">{clip(getMessage(r), 140)}</div>
                      </td>

                      <td className="px-5 py-4">
                        {st === "aberto" ? (
                          <Badge tone="amber">Aberto</Badge>
                        ) : st === "resolvido" ? (
                          <Badge tone="green">Resolvido</Badge>
                        ) : (
                          <Badge tone="slate">Ignorado</Badge>
                        )}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-2">
                          <button
                            onClick={() => openModal(r)}
                            className={buttonStyles({ variant: "secondary", size: "sm" })}
                          >
                            Ver
                          </button>

                          {st !== "resolvido" ? (
                            <button
                              onClick={() => setStatus(r, "resolvido")}
                              disabled={updatingId === r.id}
                              className={cn(buttonStyles({ variant: "primary", size: "sm" }), updatingId === r.id ? "opacity-60 cursor-wait" : "")}
                              title="Marcar como resolvido"
                            >
                              {updatingId === r.id ? "Salvando..." : "Resolver"}
                            </button>
                          ) : (
                            <button
                              onClick={() => setStatus(r, "aberto")}
                              disabled={updatingId === r.id}
                              className={cn(buttonStyles({ variant: "secondary", size: "sm" }), updatingId === r.id ? "opacity-60 cursor-wait" : "")}
                              title="Reabrir"
                            >
                              {updatingId === r.id ? "Salvando..." : "Reabrir"}
                            </button>
                          )}

                          {st !== "ignorado" ? (
                            <button
                              onClick={() => setStatus(r, "ignorado")}
                              disabled={updatingId === r.id}
                              className={cn(buttonStyles({ variant: "secondary", size: "sm" }), updatingId === r.id ? "opacity-60 cursor-wait" : "")}
                              title="Marcar como ignorado"
                            >
                              Ignorar
                            </button>
                          ) : (
                            <button
                              onClick={() => setStatus(r, "aberto")}
                              disabled={updatingId === r.id}
                              className={cn(buttonStyles({ variant: "secondary", size: "sm" }), updatingId === r.id ? "opacity-60 cursor-wait" : "")}
                              title="Voltar para aberto"
                            >
                              Reabrir
                            </button>
                          )}

                          {qId ? (
                            <Link
                              href={`/admin/questoes/${qId}`}
                              className={buttonStyles({ variant: "secondary", size: "sm" })}
                              title="Abrir edição da questão"
                            >
                              Ir para questão
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-4 border-t bg-white flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Página atual: <b>1</b>
          </div>

          <div className="flex gap-2">
            <button
              onClick={fetchPrev}
              disabled
              className={buttonStyles({ variant: "secondary", size: "sm" })}
            >
              Anterior
            </button>
            <button
              onClick={fetchNext}
              disabled={loading || !hasNextPage}
              className={buttonStyles({ variant: "secondary", size: "sm" })}
            >
              Próxima
            </button>
          </div>
        </div>
      </div>

      {/* Modal detalhes */}
      <Modal
        open={open}
        title={selected ? `Detalhes do erro (${selected.id})` : "Detalhes do erro"}
        onClose={() => {
          setOpen(false);
          setSelected(null);
        }}
      >
        {!selected ? (
          <div className="text-sm text-slate-500">Nenhum item selecionado.</div>
        ) : (
          (() => {
            const st = getReportStatus(selected);
            const uid = getUid(selected);
            const qId = getQuestionId(selected);

            const userMini = uid ? userCache[uid] : undefined;
            const alunoNome = (selected.alunoNome || userMini?.name || "").trim();

            const qMini = qId ? questionCache[qId] : undefined;
            const qText =
              qMini ? getQuestionText(qMini) : selected.questaoPergunta?.trim() ? selected.questaoPergunta!.trim() : "";

            return (
              <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="rounded-2xl border bg-white p-4 lg:col-span-2">
                    <div className="text-xs font-extrabold text-slate-700 mb-2">Mensagem</div>
                    <div className="text-sm text-slate-800 whitespace-pre-wrap">
                      {getMessage(selected) || "—"}
                    </div>
                  </div>

                  <div className="rounded-2xl border bg-white p-4">
                    <div className="text-xs font-extrabold text-slate-700 mb-2">Status</div>

                    <div className="flex items-center gap-2">
                      {st === "aberto" ? (
                        <Badge tone="amber">Aberto</Badge>
                      ) : st === "resolvido" ? (
                        <Badge tone="green">Resolvido</Badge>
                      ) : (
                        <Badge tone="slate">Ignorado</Badge>
                      )}

                      <div className="text-xs text-slate-500">
                        Criado: {toDateLabel(selected.createdAt)}
                        <br />
                        Atualizado: {toDateLabel(selected.updatedAt)}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => setStatus(selected, "aberto")}
                        disabled={updatingId === selected.id}
                        className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                      >
                        Reabrir
                      </button>

                      <button
                        onClick={() => setStatus(selected, "resolvido")}
                        disabled={updatingId === selected.id}
                        className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        Resolver
                      </button>

                      <button
                        onClick={() => setStatus(selected, "ignorado")}
                        disabled={updatingId === selected.id}
                        className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                      >
                        Ignorar
                      </button>

                      {qId ? (
                        <Link
                          href={`/admin/questoes/${qId}`}
                          className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                        >
                          Abrir questão
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-2xl border bg-white p-4">
                    <div className="text-xs font-extrabold text-slate-700 mb-2">Referências</div>
                    <div className="text-sm text-slate-700 space-y-1">
                      <div>
                        <b>Código:</b> {selected.codigo || "—"}
                      </div>
                      <div>
                        <b>questionId:</b> {qId || "—"}
                      </div>
                      <div>
                        <b>sessionId:</b> {selected.sessionId || "—"}
                      </div>
                      <div>
                        <b>attemptId:</b> {selected.attemptId || "—"}
                      </div>
                      <div>
                        <b>uid:</b> {uid || "—"}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border bg-white p-4">
                    <div className="text-xs font-extrabold text-slate-700 mb-2">Aluno</div>
                    <div className="text-sm text-slate-700 space-y-1">
                      <div>
                        <b>Nome:</b> {alunoNome || "—"}
                      </div>
                      <div>
                        <b>Email:</b> {userMini?.email || "—"}
                      </div>
                    </div>
                  </div>
                </div>

                {qId ? (
                  <div className="rounded-2xl border bg-slate-50 p-4">
                    <div className="text-xs font-extrabold text-slate-700 mb-2">Enunciado (preview)</div>
                    <div className="text-sm text-slate-800 whitespace-pre-wrap">
                      {qText ? qText : "(carregando…)"}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })()
        )}
      </Modal>
    </AdminShell>
  );
}
