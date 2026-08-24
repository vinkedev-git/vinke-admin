"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/cn";

type PaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
};

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const btn = (
    onClick: () => void,
    disabled: boolean,
    label: string,
    icon: React.ReactNode
  ) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg border text-sm transition",
        disabled
          ? "cursor-not-allowed border-slate-200 text-slate-300 dark:border-slate-700 dark:text-slate-600"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      )}
    >
      {icon}
    </button>
  );

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 text-sm", className)}>
      {/* Contagem */}
      <p className="text-slate-500 dark:text-slate-400">
        {total === 0
          ? "Nenhum registro"
          : `${from}–${to} de ${total.toLocaleString("pt-BR")} registros`}
      </p>

      <div className="flex items-center gap-2">
        {/* Page size */}
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-slate-500 dark:text-slate-400">Exibir</label>
            <select
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              {pageSizeOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}

        {/* Navegação */}
        <div className="flex items-center gap-1">
          {btn(() => onPageChange(1), page <= 1, "Primeira página", <ChevronsLeft size={14} />)}
          {btn(() => onPageChange(page - 1), page <= 1, "Página anterior", <ChevronLeft size={14} />)}

          <span className="min-w-[5rem] text-center text-xs font-semibold text-slate-700 dark:text-slate-300">
            {page} / {totalPages}
          </span>

          {btn(() => onPageChange(page + 1), page >= totalPages, "Próxima página", <ChevronRight size={14} />)}
          {btn(() => onPageChange(totalPages), page >= totalPages, "Última página", <ChevronsRight size={14} />)}
        </div>
      </div>
    </div>
  );
}
