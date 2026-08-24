"use client";

import { Badge } from "@/components/ui/Badge";

export type EntitlementStatus = "ativo" | "pendente" | "inativo" | "vencido";

type StatusBadgeProps = {
  status: EntitlementStatus;
  /** Mostra tooltip ao passar o mouse (default: true) */
  showTooltip?: boolean;
};

// ─── Mapeamento centralizado: cor, label e explicação ────────────────────────

const STATUS_CONFIG: Record<
  EntitlementStatus,
  {
    tone: "emerald" | "amber" | "slate" | "red";
    label: string;
    title: string;
    description: string;
  }
> = {
  ativo: {
    tone: "emerald",
    label: "Ativo",
    title: "Acesso liberado",
    description: "Assinatura confirmada e dentro da validade. O aluno tem acesso à plataforma.",
  },
  pendente: {
    tone: "amber",
    label: "Pendente",
    title: "Aguardando confirmação",
    description:
      "Assinatura criada mas aguardando algo (ex: pagamento ainda não confirmado, boleto não pago, cartão em análise).",
  },
  inativo: {
    tone: "slate",
    label: "Inativo",
    title: "Sem assinatura ativa",
    description:
      "Aluno não tem assinatura ativa nem em processamento. Pode ser cadastro novo sem plano ou assinatura cancelada manualmente.",
  },
  vencido: {
    tone: "red",
    label: "Vencido",
    title: "Validade expirada",
    description:
      "A assinatura estava ativa, mas a data de validade já passou. O aluno precisa renovar para ter acesso novamente.",
  },
};

// ─── Componente ──────────────────────────────────────────────────────────────

export function StatusBadge({ status, showTooltip = true }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  if (!showTooltip) {
    return <Badge tone={config.tone}>{config.label}</Badge>;
  }

  return (
    <span className="group relative inline-flex">
      {/* Badge visivel */}
      <Badge tone={config.tone}>{config.label}</Badge>

      {/* Tooltip — aparece on hover, sem JS */}
      <span
        role="tooltip"
        className="
          pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2
          rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl
          opacity-0 transition-opacity duration-150 group-hover:opacity-100
          dark:border-slate-700 dark:bg-slate-900
        "
      >
        <span className="block text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
          {config.title}
        </span>
        <span className="mt-1 block text-sm leading-snug text-slate-700 dark:text-slate-200">
          {config.description}
        </span>
      </span>
    </span>
  );
}

// ─── Helpers exportados (caso outros lugares precisem) ───────────────────────

export function statusLabel(status: EntitlementStatus): string {
  return STATUS_CONFIG[status].label;
}

export function statusTone(status: EntitlementStatus) {
  return STATUS_CONFIG[status].tone;
}
