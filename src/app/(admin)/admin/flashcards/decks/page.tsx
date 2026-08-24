"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Layers, Search } from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchInput } from "@/components/ui/SearchInput";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/apiClient";
import { MODULE_LABEL, STATUS_LABEL } from "@/lib/flashcards/constants";
import type { FlashcardStatus, Module } from "@/lib/flashcards/types";

type Deck = {
  id: string;
  title: string;
  description: string;
  moduleId: Module | null;
  themeId: string | null;
  cardCount: number;
  isActive: boolean;
  order: number;
  status: FlashcardStatus;
};

const STATUS_TONE: Record<FlashcardStatus, "emerald" | "amber" | "slate" | "red"> = {
  published: "emerald",
  pending_review: "amber",
  draft: "slate",
  archived: "red",
};

export default function DecksPage() {
  const [items, setItems] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState<Module | "">("");

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (moduleFilter) params.set("module", moduleFilter);
      const data = await api.get<{ items?: Deck[] }>(
        `/api/admin/flashcards/decks?${params.toString()}`
      );
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Nao foi possivel carregar decks."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleFilter]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return items;
    return items.filter((d) =>
      [d.title, d.description].join(" ").toLowerCase().includes(s)
    );
  }, [items, search]);

  const stats = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.total += 1;
        acc.cards += item.cardCount ?? 0;
        if (item.status === "published" && item.isActive) acc.active += 1;
        return acc;
      },
      { total: 0, cards: 0, active: 0 }
    );
  }, [items]);

  return (
    <AdminShell
      title="Decks de flashcards"
      subtitle={
        loading
          ? "Carregando..."
          : `${stats.total} decks · ${stats.cards.toLocaleString("pt-BR")} cards totais · ${stats.active} publicados`
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar deck por titulo..."
            aria-label="Filtrar decks"
            className="w-full md:w-64"
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
          <Link
            href="/admin/flashcards"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <ArrowLeft size={14} /> Voltar
          </Link>
        </div>
      }
    >
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
              <tr>
                {["Título", "Módulo", "Cards", "Status", "Ordem"].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <TableRowSkeleton cols={5} rows={8} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      icon={Layers}
                      title={search ? "Nenhum deck encontrado" : "Nenhum deck cadastrado"}
                      description={
                        search
                          ? "Ajuste os filtros ou tente outros termos."
                          : "Importe a planilha via CLI: npm run flashcards:import"
                      }
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((deck) => (
                  <tr
                    key={deck.id}
                    className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  >
                    <td className="max-w-md px-5 py-4">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        {deck.title}
                      </div>
                      {deck.description && (
                        <div className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                          {deck.description}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone="slate">
                        {deck.moduleId ? MODULE_LABEL[deck.moduleId] : "—"}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 font-mono text-sm text-slate-700 dark:text-slate-300">
                      {deck.cardCount ?? 0}
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={STATUS_TONE[deck.status]}>
                        {STATUS_LABEL[deck.status]}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-slate-500">{deck.order}</td>
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
