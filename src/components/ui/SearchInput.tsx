"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
};

/**
 * Campo de busca reutilizável com ícone de lupa e botão de limpar opcional.
 */
export function SearchInput({
  value,
  onChange,
  onClear,
  placeholder = "Buscar...",
  className,
  "aria-label": ariaLabel,
}: SearchInputProps) {
  return (
    <div className={cn("relative", className)}>
      <Search
        size={15}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
        aria-hidden="true"
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-9 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
      />
      {value && (onClear ?? true) && (
        <button
          type="button"
          onClick={() => { onChange(""); onClear?.(); }}
          aria-label="Limpar busca"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
