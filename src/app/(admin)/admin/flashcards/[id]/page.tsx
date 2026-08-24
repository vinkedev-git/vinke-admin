"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Save, ExternalLink, CheckCircle } from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/apiClient";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  MODULES,
  MODULE_LABEL,
  STATUSES,
  STATUS_LABEL,
} from "@/lib/flashcards/constants";
import type { Difficulty, FlashcardStatus, Module } from "@/lib/flashcards/types";

type Form = {
  frontText: string;
  backText: string;
  shortExplanation: string;
  themeName: string;
  moduleId: Module | "";
  difficulty: Difficulty;
  status: FlashcardStatus;
  isActive: boolean;
  needsReview: boolean;
  reviewNotes: string;
  deckIds: string;
  tags: string;
  sourceQuestionId: string | null;
  sourceQuestionPreview: string | null;
  sourceCorrectOptionText: string | null;
  sourceReference: string | null;
};

const EMPTY: Form = {
  frontText: "",
  backText: "",
  shortExplanation: "",
  themeName: "",
  moduleId: "",
  difficulty: "medium",
  status: "pending_review",
  isActive: false,
  needsReview: true,
  reviewNotes: "",
  deckIds: "",
  tags: "",
  sourceQuestionId: null,
  sourceQuestionPreview: null,
  sourceCorrectOptionText: null,
  sourceReference: null,
};

export default function EditFlashcardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { dialog: confirmDialog, confirm } = useConfirm();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await api.get<{ item?: Record<string, unknown> }>(
          `/api/admin/flashcards/${params.id}`
        );
        const item = data.item ?? {};
        setForm({
          frontText: String(item.frontText ?? ""),
          backText: String(item.backText ?? ""),
          shortExplanation: String(item.shortExplanation ?? ""),
          themeName: String(item.themeName ?? ""),
          moduleId: (item.moduleId as Module | "") ?? "",
          difficulty: (item.difficulty as Difficulty) ?? "medium",
          status: (item.status as FlashcardStatus) ?? "pending_review",
          isActive: Boolean(item.isActive),
          needsReview: Boolean(item.needsReview),
          reviewNotes: String(item.reviewNotes ?? ""),
          deckIds: Array.isArray(item.deckIds) ? (item.deckIds as string[]).join("; ") : "",
          tags: Array.isArray(item.tags) ? (item.tags as string[]).join("; ") : "",
          sourceQuestionId: (item.sourceQuestionId as string | null) ?? null,
          sourceQuestionPreview: (item.sourceQuestionPreview as string | null) ?? null,
          sourceCorrectOptionText: (item.sourceCorrectOptionText as string | null) ?? null,
          sourceReference: (item.sourceReference as string | null) ?? null,
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Nao foi possivel carregar.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [params.id]);

  const onSave = async (opts?: { publishAfter?: boolean }) => {
    setSaving(true);
    try {
      const payload = {
        frontText: form.frontText,
        backText: form.backText,
        shortExplanation: form.shortExplanation,
        themeName: form.themeName,
        moduleId: form.moduleId || null,
        difficulty: form.difficulty,
        status: opts?.publishAfter ? "published" : form.status,
        isActive: opts?.publishAfter ? true : form.isActive,
        needsReview: opts?.publishAfter ? false : form.needsReview,
        reviewNotes: form.reviewNotes,
        deckIds: form.deckIds
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean),
        tags: form.tags
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      await api.patch(`/api/admin/flashcards/${params.id}`, payload);
      toast.success(opts?.publishAfter ? "Flashcard publicado!" : "Salvo com sucesso.");
      if (opts?.publishAfter) router.push("/admin/flashcards");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel salvar.");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: "Excluir este flashcard?",
      description: "Esta acao nao pode ser desfeita.",
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await api.delete(`/api/admin/flashcards/${params.id}`);
      toast.success("Flashcard excluido.");
      router.push("/admin/flashcards");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel excluir.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AdminShell
      title="Editar flashcard"
      subtitle={form.themeName || "—"}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => router.push("/admin/flashcards")}>
            <ArrowLeft size={14} /> Voltar
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void onSave()} disabled={saving || loading}>
            <Save size={14} /> {saving ? "Salvando..." : "Salvar"}
          </Button>
          {form.status !== "published" && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => void onSave({ publishAfter: true })}
              disabled={saving || loading}
            >
              <CheckCircle size={14} /> Publicar
            </Button>
          )}
          <Button variant="danger" size="sm" onClick={() => void onDelete()} disabled={deleting || loading}>
            <Trash2 size={14} /> Excluir
          </Button>
        </div>
      }
    >
      {confirmDialog}
      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Carregando...
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          {/* Coluna esquerda — edicao */}
          <div className="space-y-6">
            <Card title="Frente do card">
              <TextArea
                value={form.frontText}
                onChange={(v) => setForm((f) => ({ ...f, frontText: v }))}
                placeholder="Pergunta curta e objetiva"
                rows={4}
              />
            </Card>

            <Card title="Verso do card">
              <TextArea
                value={form.backText}
                onChange={(v) => setForm((f) => ({ ...f, backText: v }))}
                placeholder="Resposta direta"
                rows={3}
              />
            </Card>

            <Card title="Explicacao curta">
              <TextArea
                value={form.shortExplanation}
                onChange={(v) => setForm((f) => ({ ...f, shortExplanation: v }))}
                placeholder="Justificativa em ate 2 paragrafos"
                rows={5}
              />
            </Card>

            <Card title="Notas internas de revisao">
              <TextArea
                value={form.reviewNotes}
                onChange={(v) => setForm((f) => ({ ...f, reviewNotes: v }))}
                placeholder="Observacoes que nao aparecem para o aluno"
                rows={3}
              />
            </Card>
          </div>

          {/* Coluna direita — metadados + contexto */}
          <div className="space-y-6">
            <Card title="Metadados">
              <div className="grid gap-3">
                <Field label="Tema">
                  <input
                    value={form.themeName}
                    onChange={(e) => setForm((f) => ({ ...f, themeName: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800"
                  />
                </Field>
                <Field label="Modulo">
                  <Select
                    value={form.moduleId}
                    onChange={(v) => setForm((f) => ({ ...f, moduleId: v as Module | "" }))}
                    options={[
                      ["", "—"],
                      ...MODULES.map((m) => [m, MODULE_LABEL[m]] as [string, string]),
                    ]}
                  />
                </Field>
                <Field label="Dificuldade">
                  <Select
                    value={form.difficulty}
                    onChange={(v) => setForm((f) => ({ ...f, difficulty: v as Difficulty }))}
                    options={DIFFICULTIES.map(
                      (d) => [d, DIFFICULTY_LABEL[d]] as [string, string]
                    )}
                  />
                </Field>
                <Field label="Status">
                  <Select
                    value={form.status}
                    onChange={(v) => setForm((f) => ({ ...f, status: v as FlashcardStatus }))}
                    options={STATUSES.map((s) => [s, STATUS_LABEL[s]] as [string, string])}
                  />
                </Field>
                <Field label="Decks (separados por ;)">
                  <input
                    value={form.deckIds}
                    onChange={(e) => setForm((f) => ({ ...f, deckIds: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800"
                  />
                </Field>
                <Field label="Tags (separadas por ;)">
                  <input
                    value={form.tags}
                    onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800"
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  />
                  Ativo (visivel para o aluno)
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={form.needsReview}
                    onChange={(e) => setForm((f) => ({ ...f, needsReview: e.target.checked }))}
                  />
                  Precisa revisar
                </label>
              </div>
            </Card>

            {form.sourceQuestionPreview && (
              <Card title="Questao original (contexto)">
                <div className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                  {form.sourceQuestionPreview}
                </div>
                {form.sourceCorrectOptionText && (
                  <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                    <strong>Resposta correta:</strong> {form.sourceCorrectOptionText}
                  </div>
                )}
                {form.sourceReference && (
                  <div className="mt-3 text-xs text-slate-500 italic">
                    Referencia: {form.sourceReference}
                  </div>
                )}
                {form.sourceQuestionId && (
                  <a
                    href={`/admin/questoes/${form.sourceQuestionId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
                  >
                    <ExternalLink size={12} /> Abrir questao no admin
                  </a>
                )}
              </Card>
            )}
          </div>
        </div>
      )}
    </AdminShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
        {title}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
        {label}
      </div>
      {children}
    </div>
  );
}

function TextArea({
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800"
    />
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800"
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
