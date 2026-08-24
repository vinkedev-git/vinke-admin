"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

type BadgeTone = "blue" | "green" | "amber" | "red" | "slate" | "emerald" | "indigo";

/*
 * Os estilos de cor do Badge são definidos em globals.css via [data-tone]
 * para evitar conflito com os overrides !important do globals.css dark mode.
 */
type BadgeProps = {
  tone?: BadgeTone;
  onClick?: () => void;
  title?: string;
  className?: string;
  children: React.ReactNode;
};

export function Badge({ tone = "slate", onClick, title, className, children }: BadgeProps) {
  return (
    <span
      data-tone={tone}
      title={title}
      onClick={onClick}
      className={cn(
        "badge inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold select-none",
        onClick && "cursor-pointer hover:opacity-80 transition-opacity",
        className
      )}
    >
      {children}
    </span>
  );
}
