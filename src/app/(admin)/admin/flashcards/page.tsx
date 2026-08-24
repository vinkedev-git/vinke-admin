"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckSquare, Layers, Pencil, Sparkles } from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { buttonStyles } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SearchInput } from "@/components/ui/SearchInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/apiClient";
import {
  DIFFICULTY_LABEL,
  MODULE_LABEL,
  STATUS_LABEL,
} from "@/lib/flashcards/constants";
import type {
  Difficulty,
  FlashcardStatus,
  Module,
} from "@/lib/flashcards/types";

type FlashcardListItem = {
  id: string;
  frontText: string;
  backText: string;
  themeName: string;
  moduleId: Module | "";
  examType: string;
  examYear: number | null;
  difficulty: Difficulty;
  status: FlashcardStatus;
  isActive: boolean;
  needsReview: boolean;
  deckIds: string[];
  sourceQuestionId: string | null;
};

const STATUS_TONE: Record<FlashcardStatus, "emerald" | "amber" | "slate" | "red"> = {
  published: "emerald",
  pending_review: "amber",
  draft: "slate",
  archived: "red",
};

const DIFFICULTY_TONE: Record<Difficulty, "emerald" | "amber" | "red"> = {
  easy: "emerald",
  medium: "amber",
  hard: "red",
};

export default function FlashcardsPage() {
  const [items, setItems] = useState<FlashcardListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FlashcardStatus | "">("");
  const [moduleFilter, setModuleFilter] = useState<Module | "">("");
  const [difficultyFilter, setDifficultyFilter] = useState<Difficulty | "">("");

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (moduleFilter) params.set("module", moduleFilter);
      if (difficultyFilter) params.set("difficulty", difficultyFilter);
      params.set("limit", "200");
      const data = await api.get<{ items?: FlashcardListItem[] }>(
        `/api/admin/flashcards?${params.toString()}`
      );
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Nao foi possivel carregar flashcards."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, moduleFilter, difficultyFilter]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return items;
    return items.filter((item) =>
      [item.frontText, item.backText, item.themeName].join(" ").toLowerCase().includes(s)
    );
  }, [items, search]);

  const stats = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.status === "pending_review") acc.pending += 1;
        if (item.status === "published" && item.isActive) acc.active += 1;
        return acc;
      },
      { total: 0, pending: 0, active: 0 }
    );
  }, [items]);

  return (
    <AdminShell
      title="Flashcards"
      subtitle={
        loading
          ? "Carregando..."
          : `${stats.total} total · ${stats.pending} pendentes · ${stats.active} publicados`
      }
      actions={
        <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por frente, verso ou tema..."
            aria-label="Filtrar flashcards"
            className="w-full md:w-72"
          />
          <Link
            href="/admin/flashcards/revisar"
            className={buttonStyles({ variant: "primary" })}
          >
            <CheckSquare size={15} aria-hidden="true" /> Revisar pendentes
          </Link>
          <Link
            href="/admin/flashcards/decks"
            className={buttonStyles({ variant: "secondary" })}
          >
            <Layers size={15} aria-hidden="true" /> Decks
          </Link>
        </div>
      }
    >
      {/* Filtros */}
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterSelect
          label="Status"
          value={statusFilter}
          options={[
            ["", "Todos"],
            ["pending_review", STATUS_LABEL.pending_review],
            ["published", STATUS_LABEL.published],
            ["draft", STATUS_LABEL.draft],
            ["archived", STATUS_LABEL.archived],
          ]}
          onChange={(v) => setStatusFilter(v as FlashcardStatus | "")}
        />
        <FilterSelect
          label="Modulo"
          value={moduleFilter}
          options={[
            ["", "Todos"],
            ["me", MODULE_LABEL.me],
            ["tea", MODULE_LABEL.tea],
            ["tsa", MODULE_LABEL.tsa],
          ]}
          onChange={(v) => setModuleFilter(v as Module | "")}
        />
        <FilterSelect
          label="Dificuldade"
          value={difficultyFilter}
          options={[
            ["", "Todas"],
            ["easy", DIFFICULTY_LABEL.easy],
            ["medium", DIFFICULTY_LABEL.medium],
            ["hard", DIFFICULTY_LABEL.hard],
          ]}
          onChange={(v) => setDifficultyFilter(v as Difficulty | "")}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
              <tr>
                {["Frente", "Tema", "Módulo", "Dif.", "Status", ""].map((h) => (
                  <th
                    key={h}
                    className={`px-5 py-3.5 text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400 ${
                      h === "" ? "text-right" : "text-left"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <TableRowSkeleton cols={6} rows={8} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={Sparkles}
                      title={search ? "Nenhum flashcard encontrado" : "Nenhum flashcard cadastrado"}
                      description={
                        search
                          ? "Ajuste os filtros ou tente outros termos."
                          : "Importe a planilha via CLI: npm run flashcards:import -- --file=<caminho.xlsx>"
                      }
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr
                    key={item.id}
                    className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  >
                    <td className="max-w-md px-5 py-4">
                      <div
                        className="line-clamp-2 font-medium text-slate-800 dark:text-slate-200"
                        title={item.frontText}
                      >
                        {item.frontText}
                      </div>
                      <div
                        className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400"
                        title={item.backText}
                      >
                        R: {item.backText}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-400">
                      {item.themeName || "—"}
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone="slate">
                        {item.moduleId ? MODULE_LABEL[item.moduleId as Module] : "—"}
                      </Badge>
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={DIFFICULTY_TONE[item.difficulty]}>
                        {DIFFICULTY_LABEL[item.difficulty]}
                      </Badge>
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={STATUS_TONE[item.status]}>
                        {STATUS_LABEL[item.status]}
                      </Badge>
                      {item.needsReview && (
                        <div className="mt-1 text-xs font-semibold text-amber-600">
                          precisa revisar
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/admin/flashcards/${item.id}`}
                          className={buttonStyles({ variant: "primary", size: "sm" })}
                        >
                          <Pencil size={13} /> Editar
                        </Link>
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

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
      <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
        {label}:
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
