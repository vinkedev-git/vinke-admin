"use client";

import * as React from "react";
import { useEffect, useRef } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";

type ConfirmDialogProps = {
  open: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title = "Confirmar ação",
  description = "Esta ação não pode ser desfeita. Tem certeza?",
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    cancelRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-desc" className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className={cn(
          "relative w-full max-w-sm rounded-2xl border bg-white shadow-2xl dark:bg-slate-900",
          variant === "danger" ? "dark:border-rose-900 border-rose-100" : "dark:border-amber-900 border-amber-100"
        )}>
          <div className="p-6">
            {/* Ícone */}
            <div className={cn(
              "mb-4 flex h-12 w-12 items-center justify-center rounded-2xl",
              variant === "danger"
                ? "bg-rose-100 dark:bg-rose-950"
                : "bg-amber-100 dark:bg-amber-950"
            )}>
              {variant === "danger"
                ? <Trash2 size={22} className="text-rose-600 dark:text-rose-400" />
                : <AlertTriangle size={22} className="text-amber-600 dark:text-amber-400" />
              }
            </div>

            {/* Texto */}
            <p id="confirm-title" className="text-base font-extrabold text-slate-900 dark:text-slate-50">{title}</p>
            <p id="confirm-desc" className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>
          </div>

          {/* Ações */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4 dark:border-slate-800">
            <Button ref={cancelRef} variant="secondary" size="sm" onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button variant="danger" size="sm" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook auxiliar para facilitar o uso do ConfirmDialog sem gerenciar estado manualmente.
 *
 * ```tsx
 * const { dialog, confirm } = useConfirm();
 * await confirm({ title: "Excluir?", description: "Não dá pra voltar." });
 * ```
 */
export function useConfirm() {
  const [state, setState] = React.useState<{
    open: boolean;
    title?: string;
    description?: string;
    confirmLabel?: string;
    variant?: "danger" | "warning";
    resolve?: (ok: boolean) => void;
  }>({ open: false });

  const confirm = React.useCallback(
    (opts?: Omit<ConfirmDialogProps, "open" | "onConfirm" | "onCancel">) => {
      return new Promise<boolean>((resolve) => {
        setState({ open: true, ...opts, resolve });
      });
    },
    []
  );

  const handleConfirm = () => {
    state.resolve?.(true);
    setState((s) => ({ ...s, open: false }));
  };

  const handleCancel = () => {
    state.resolve?.(false);
    setState((s) => ({ ...s, open: false }));
  };

  const dialog = (
    <ConfirmDialog
      open={state.open}
      title={state.title}
      description={state.description}
      confirmLabel={state.confirmLabel}
      variant={state.variant}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { dialog, confirm };
}
