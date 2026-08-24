"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Edit3,
  Save,
  SkipForward,
  Sparkles,
  X,
} from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/apiClient";
import { DIFFICULTY_LABEL, MODULE_LABEL } from "@/lib/flashcards/constants";
import type { Difficulty, Module } from "@/lib/flashcards/types";

type Card = {
  id: string;
  frontText: string;
  backText: string;
  shortExplanation: string;
  themeName: string;
  moduleId: Module | "";
  examType: string;
  examYear: number | null;
  difficulty: Difficulty;
  sourceQuestionId: string | null;
  sourceQuestionPreview?: string | null;
  sourceCorrectOptionText?: string | null;
  sourceReference?: string | null;
};

const DIFFICULTY_TONE: Record<Difficulty, "emerald" | "amber" | "red"> = {
  easy: "emerald",
  medium: "amber",
  hard: "red",
};

/**
 * Wizard de revisao em massa.
 *
 * Atalhos de teclado:
 *  - Enter / Espaco  → Aprovar (publicar)
 *  - E               → Editar inline
 *  - X               → Rejeitar (arquivar)
 *  - S / →           → Pular (proximo, sem alterar)
 *  - ←               → Voltar
 *  - Esc             → Cancelar edicao
 */
export default function RevisarFlashcardsPage() {
  const [items, setItems] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [showContext, setShowContext] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [batchStats, setBatchStats] = useState({
    approved: 0,
    rejected: 0,
    edited: 0,
    skipped: 0,
  });

  const [frontEdit, setFrontEdit] = useState("");
  const [backEdit, setBackEdit] = useState("");
  const [explainEdit, setExplainEdit] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ items?: Card[] }>(
        "/api/admin/flashcards?status=pending_review&limit=50"
      );
      const rows = Array.isArray(data.items) ? data.items : [];
      setItems(rows);
      setIndex(0);
      setBatchStats({ approved: 0, rejected: 0, edited: 0, skipped: 0 });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Nao foi possivel carregar."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const current = items[index];
  const total = items.length;
  const isDone = !loading && (total === 0 || index >= total);

  useEffect(() => {
    if (!current) return;
    setFrontEdit(current.frontText);
    setBackEdit(current.backText);
    setExplainEdit(current.shortExplanation);
    setShowContext(false);
    setEditing(false);
  }, [current]);

  const advance = useCallback(() => {
    setIndex((i) => i + 1);
  }, []);

  const goBack = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const approve = useCallback(async () => {
    if (!current || saving) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { status: "published" };
      // Se o usuario editou, salva as edicoes junto com a publicacao
      if (
        frontEdit !== current.frontText ||
        backEdit !== current.backText ||
        explainEdit !== current.shortExplanation
      ) {
        payload.frontText = frontEdit;
        payload.backText = backEdit;
        payload.shortExplanation = explainEdit;
      }
      await api.patch(`/api/admin/flashcards/${current.id}`, payload);
      setBatchStats((s) => ({ ...s, approved: s.approved + 1 }));
      advance();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Nao foi possivel aprovar."
      );
    } finally {
      setSaving(false);
    }
  }, [current, saving, frontEdit, backEdit, explainEdit, advance]);

  const reject = useCallback(async () => {
    if (!current || saving) return;
    setSaving(true);
    try {
      await api.patch(`/api/admin/flashcards/${current.id}`, {
        status: "archived",
      });
      setBatchStats((s) => ({ ...s, rejected: s.rejected + 1 }));
      advance();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Nao foi possivel rejeitar."
      );
    } finally {
      setSaving(false);
    }
  }, [current, saving, advance]);

  const saveEdit = useCallback(async () => {
    if (!current || saving) return;
    setSaving(true);
    try {
      await api.patch(`/api/admin/flashcards/${current.id}`, {
        frontText: frontEdit,
        backText: backEdit,
        shortExplanation: explainEdit,
      });
      // Atualiza local
      setItems((prev) =>
        prev.map((c, i) =>
          i === index
            ? {
                ...c,
                frontText: frontEdit,
                backText: backEdit,
                shortExplanation: explainEdit,
              }
            : c
        )
      );
      setBatchStats((s) => ({ ...s, edited: s.edited + 1 }));
      setEditing(false);
      toast.success("Edicoes salvas.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Nao foi possivel salvar."
      );
    } finally {
      setSaving(false);
    }
  }, [current, saving, frontEdit, backEdit, explainEdit, index]);

  const skip = useCallback(() => {
    setBatchStats((s) => ({ ...s, skipped: s.skipped + 1 }));
    advance();
  }, [advance]);

  // Atalhos de teclado
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (loading || isDone) return;
      // Nao interferir enquanto o usuario esta digitando em textarea
      const target = e.target as HTMLElement;
      const isInput =
        target?.tagName === "TEXTAREA" || target?.tagName === "INPUT";

      if (e.key === "Escape") {
        if (editing) {
          setEditing(false);
          e.preventDefault();
        }
        return;
      }
      if (isInput) return;

      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        void approve();
      } else if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        setEditing((v) => !v);
      } else if (e.key === "x" || e.key === "X") {
        e.preventDefault();
        void reject();
      } else if (e.key === "s" || e.key === "S" || e.key === "ArrowRight") {
        e.preventDefault();
        skip();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goBack();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [loading, isDone, editing, approve, reject, skip, goBack]);

  const progress = useMemo(() => {
    if (total === 0) return 0;
    return Math.min(100, Math.round((index / total) * 100));
  }, [index, total]);

  return (
    <AdminShell
      title="Revisar flashcards"
      subtitle={
        loading
          ? "Carregando..."
          : total === 0
          ? "Nenhum card pendente"
          : `Card ${Math.min(index + 1, total)} de ${total}`
      }
      actions={
        <Link
          href="/admin/flashcards"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <ArrowLeft size={14} /> Voltar
        </Link>
      }
    >
      {/* Barra de progresso */}
      <div className="mb-6 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Estatisticas do lote */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Aprovados" value={batchStats.approved} tone="emerald" />
        <StatCard label="Editados" value={batchStats.edited} tone="blue" />
        <StatCard label="Pulados" value={batchStats.skipped} tone="slate" />
        <StatCard label="Rejeitados" value={batchStats.rejected} tone="red" />
      </div>

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-16 text-center text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Carregando cards...
        </div>
      ) : isDone ? (
        <DoneScreen stats={batchStats} onReload={load} />
      ) : current ? (
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {/* Header do card com badges */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
            <Badge tone="slate">
              {current.moduleId
                ? MODULE_LABEL[current.moduleId as Module]
                : "—"}
            </Badge>
            <Badge tone={DIFFICULTY_TONE[current.difficulty]}>
              {DIFFICULTY_LABEL[current.difficulty]}
            </Badge>
            {current.themeName && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {current.themeName}
              </span>
            )}
            {current.examType && current.examYear && (
              <span className="ml-auto text-xs font-semibold text-slate-500">
                {current.examType} · {current.examYear}
              </span>
            )}
          </div>

          <div className="space-y-6 p-6 sm:p-8">
            {/* Frente */}
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-widest text-blue-600">
                Frente (pergunta)
              </div>
              {editing ? (
                <textarea
                  value={frontEdit}
                  onChange={(e) => setFrontEdit(e.target.value)}
                  rows={4}
                  className="w-full resize-y rounded-2xl border border-blue-200 bg-blue-50/50 px-4 py-3 text-lg outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-blue-800 dark:bg-blue-950/30"
                />
              ) : (
                <div className="rounded-2xl bg-slate-50 px-4 py-4 text-lg leading-relaxed text-slate-900 dark:bg-slate-800 dark:text-slate-100">
                  {current.frontText}
                </div>
              )}
            </div>

            {/* Verso */}
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-widest text-emerald-600">
                Verso (resposta)
              </div>
              {editing ? (
                <textarea
                  value={backEdit}
                  onChange={(e) => setBackEdit(e.target.value)}
                  rows={2}
                  className="w-full resize-y rounded-2xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 text-base font-semibold outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30"
                />
              ) : (
                <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-base font-semibold text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                  {current.backText}
                </div>
              )}
            </div>

            {/* Explicacao */}
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                Explicacao curta
              </div>
              {editing ? (
                <textarea
                  value={explainEdit}
                  onChange={(e) => setExplainEdit(e.target.value)}
                  rows={4}
                  className="w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800"
                />
              ) : (
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {current.shortExplanation || (
                    <span className="italic text-slate-400">
                      (sem explicacao)
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Contexto (colapsavel) */}
            {(current.sourceQuestionPreview || current.sourceReference) && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowContext((v) => !v)}
                  className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700"
                >
                  {showContext ? (
                    <ChevronUp size={12} />
                  ) : (
                    <ChevronDown size={12} />
                  )}
                  Contexto da questao original
                </button>
                {showContext && (
                  <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50/50 p-4 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
                    <div className="whitespace-pre-wrap">
                      {current.sourceQuestionPreview}
                    </div>
                    {current.sourceCorrectOptionText && (
                      <div className="mt-3 rounded-lg bg-emerald-100 px-3 py-2 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                        <strong>Correta:</strong>{" "}
                        {current.sourceCorrectOptionText}
                      </div>
                    )}
                    {current.sourceReference && (
                      <div className="mt-2 italic text-slate-500">
                        {current.sourceReference}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Barra de acoes */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={goBack}
                disabled={index === 0 || saving}
              >
                <ArrowLeft size={14} /> Voltar
              </Button>
              <Button variant="secondary" size="sm" onClick={skip} disabled={saving}>
                <SkipForward size={14} /> Pular <Kbd>S</Kbd>
              </Button>
              {editing ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void saveEdit()}
                  disabled={saving}
                >
                  <Save size={14} /> Salvar edicao
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditing(true)}
                  disabled={saving}
                >
                  <Edit3 size={14} /> Editar <Kbd>E</Kbd>
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="danger"
                size="sm"
                onClick={() => void reject()}
                disabled={saving}
              >
                <X size={14} /> Rejeitar <Kbd>X</Kbd>
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void approve()}
                disabled={saving}
              >
                <Check size={14} /> Aprovar e publicar <Kbd>Enter</Kbd>
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Atalhos hint */}
      {!loading && !isDone && (
        <div className="mt-4 text-center text-xs text-slate-500">
          Atalhos: <Kbd>Enter</Kbd> aprovar · <Kbd>E</Kbd> editar ·{" "}
          <Kbd>X</Kbd> rejeitar · <Kbd>S</Kbd> pular · <Kbd>←</Kbd> voltar
        </div>
      )}
    </AdminShell>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="ml-1 inline-flex items-center rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
      {children}
    </kbd>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "blue" | "slate" | "red";
}) {
  const colors: Record<string, string> = {
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400",
    blue: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-400",
    slate:
      "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300",
    red: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400",
  };
  return (
    <div className={`rounded-2xl border px-4 py-3 ${colors[tone]}`}>
      <div className="text-xs font-bold uppercase tracking-widest opacity-80">
        {label}
      </div>
      <div className="mt-1 text-2xl font-black">{value}</div>
    </div>
  );
}

function DoneScreen({
  stats,
  onReload,
}: {
  stats: { approved: number; rejected: number; edited: number; skipped: number };
  onReload: () => void;
}) {
  const total = stats.approved + stats.rejected + stats.skipped;
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
        <Sparkles size={32} className="text-emerald-500" />
      </div>
      <h2 className="mb-2 text-2xl font-black text-slate-900 dark:text-white">
        {total === 0 ? "Nao ha cards pendentes" : "Lote finalizado!"}
      </h2>
      <p className="mb-6 text-sm text-slate-500">
        {total === 0
          ? "Todos os cards ja foram revisados."
          : `Voce revisou ${total} cards. Deseja continuar com o proximo lote?`}
      </p>
      <div className="flex justify-center gap-2">
        <Link
          href="/admin/flashcards"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          Ir para lista
        </Link>
        <button
          type="button"
          onClick={onReload}
          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-700 to-blue-500 px-5 py-2.5 text-sm font-bold text-white shadow-md hover:from-blue-600 hover:to-blue-400"
        >
          <ArrowRight size={14} /> Proximo lote
        </button>
      </div>
    </div>
  );
}
