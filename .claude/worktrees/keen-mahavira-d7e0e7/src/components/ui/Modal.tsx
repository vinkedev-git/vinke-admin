"use client";

import * as React from "react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";

type ModalSize = "sm" | "md" | "lg" | "xl";

const sizeStyles: Record<ModalSize, string> = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

type ModalProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  size?: ModalSize;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function Modal({
  open,
  title,
  subtitle,
  onClose,
  size = "xl",
  children,
  footer,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);

    const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    firstFocusable?.focus();

    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          ref={panelRef}
          className={cn(
            "relative w-full overflow-hidden rounded-2xl border bg-white shadow-xl",
            "dark:border-slate-700 dark:bg-slate-900",
            sizeStyles[size]
          )}
        >
          <div className={cn(
            "flex items-center justify-between gap-3 border-b px-5 py-4",
            "dark:border-slate-700"
          )}>
            <div className="min-w-0">
              <div id="modal-title" className="truncate text-sm font-extrabold text-slate-900 dark:text-slate-50">
                {title}
              </div>
              {subtitle && (
                <div className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</div>
              )}
            </div>
            <Button onClick={onClose} variant="secondary" size="sm">
              Fechar
            </Button>
          </div>
          <div className="max-h-[75vh] overflow-auto p-5">{children}</div>
          {footer && (
            <div className={cn(
              "flex items-center justify-end gap-3 border-t px-5 py-4",
              "dark:border-slate-700"
            )}>
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
