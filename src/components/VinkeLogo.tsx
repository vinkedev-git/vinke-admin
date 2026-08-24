import { cn } from "@/lib/cn";

/**
 * Símbolo oficial Vinke (Direção H — "Fenda"): check em dois traços com
 * fenda diagonal paralela ao braço ascendente. Geometria extraída do
 * brand board do Claude Design — não alterar os pontos.
 */
export function VinkeSymbol({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
      className={cn("text-vinke", className)}
    >
      <line x1="15" y1="33" x2="41" y2="74" stroke="currentColor" strokeWidth="17" />
      <line x1="51" y1="65" x2="87" y2="10" stroke="currentColor" strokeWidth="17" />
    </svg>
  );
}

export function VinkeWordmark({
  symbolSize = 22,
  className,
  symbolClassName,
  textClassName,
}: {
  symbolSize?: number;
  className?: string;
  symbolClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <VinkeSymbol size={symbolSize} className={symbolClassName} />
      <span
        className={cn(
          "font-display text-lg font-bold tracking-[0.01em] text-slate-900 dark:text-white",
          textClassName
        )}
      >
        VINKE
      </span>
    </span>
  );
}
