import { cn } from "@/lib/cn";

type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800",
        className
      )}
      aria-hidden="true"
    />
  );
}

/** Linha de tabela skeleton com N colunas */
export function TableRowSkeleton({ cols = 5, rows = 5 }: { cols?: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, ri) => (
        <tr key={ri} aria-hidden="true">
          {Array.from({ length: cols }).map((_, ci) => (
            <td key={ci} className="px-4 py-3">
              <Skeleton className={cn("h-4", ci === 0 ? "w-20" : ci === cols - 1 ? "w-16" : "w-full")} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Card inteiro skeleton — p/ dashboards e detalhes */
export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900" aria-hidden="true">
      <Skeleton className="mb-4 h-5 w-40" />
      <div className="space-y-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={cn("h-4", i % 3 === 2 ? "w-3/5" : "w-full")} />
        ))}
      </div>
    </div>
  );
}

/** Grade de KPI cards skeletons */
export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <Skeleton className="mb-2 h-3 w-24" />
          <Skeleton className="h-8 w-16" />
        </div>
      ))}
    </div>
  );
}
