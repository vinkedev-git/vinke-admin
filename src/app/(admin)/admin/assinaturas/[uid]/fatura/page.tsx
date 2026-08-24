"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import { Button } from "@/components/ui/Button";
import { dateFromUnknown } from "@/lib/dateValue";
import { auth } from "@/lib/firebase";

type BillingInvoice = {
  id: string;
  createdAt?: unknown;
  service?: string | null;
  invoiceNumber?: string | null;
  total?: number | null;
  status?: string | null;
  provider?: string | null;
  providerId?: string | null;
  link?: string | null;
};

type BillingMovement = {
  id: string;
  createdAt?: unknown;
  status?: string | null;
  comment?: string | null;
};

type FaturaPayload = {
  aluno: string;
  email: string;
  code: string;
  total: number | null;
  dueDate: unknown;
  createdAt: unknown;
  status: string;
  paymentMethod: string;
  service: string;
  planCode: string;
  productId: string;
  invoices: BillingInvoice[];
  movements: BillingMovement[];
};

function formatDate(value: unknown) {
  const parsed = dateFromUnknown(value);
  if (!parsed) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(parsed);
}

function formatCurrency(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function parseAmountDraft(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function ReadonlyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-700">
        {value || "—"}
      </div>
    </div>
  );
}

export default function FaturaPage() {
  const params = useParams<{ uid: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState("pendente");
  const [commentDraft, setCommentDraft] = useState("");
  const [amountDraft, setAmountDraft] = useState("");
  const [payload, setPayload] = useState<FaturaPayload>({
    aluno: "",
    email: "",
    code: "",
    total: null,
    dueDate: null,
    createdAt: null,
    status: "pendente",
    paymentMethod: "",
    service: "",
    planCode: "",
    productId: "",
    invoices: [],
    movements: [],
  });

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Sessão inválida. Faça login novamente.");

      const res = await fetch(`/api/admin/faturas/${params.uid}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        aluno?: {
          user?: Record<string, unknown>;
          profile?: Record<string, unknown>;
          entitlement?: Record<string, unknown>;
        };
        billing?: {
          manualTotal?: unknown;
          invoices?: BillingInvoice[];
          movements?: BillingMovement[];
        };
      };

      if (!res.ok || !data.ok || !data.aluno) {
        throw new Error(data.error || "Não foi possível carregar a fatura.");
      }

      const user = data.aluno.user ?? {};
      const profile = data.aluno.profile ?? {};
      const ent = data.aluno.entitlement ?? {};

      const nextPayload: FaturaPayload = {
        aluno:
          String(profile.name ?? "").trim() ||
          String(user.name ?? "").trim() ||
          "Aluno sem nome",
        email: String(user.email ?? ent.email ?? "").trim(),
        code: String(ent.invoiceId ?? ent.lastEventId ?? params.uid).trim(),
        total: (() => {
          const manual =
            data.billing?.manualTotal != null && Number.isFinite(Number(data.billing.manualTotal))
              ? Number(data.billing.manualTotal)
              : null;
          if (manual != null) return manual;
          return ent.amountPaid != null && Number.isFinite(Number(ent.amountPaid))
            ? Number(ent.amountPaid)
            : null;
        })(),
        dueDate: ent.validUntil ?? null,
        createdAt: ent.paidAt ?? ent.updatedAt ?? user.createdAt ?? null,
        status: String(ent.invoiceStatus ?? (ent.active === true ? "ativo" : ent.pending === true ? "pendente" : "inativo")).trim() || "pendente",
        paymentMethod: String(ent.paymentMethod ?? "").trim(),
        service: String(ent.productTitle ?? "").trim(),
        planCode: String(ent.planId ?? "").trim(),
        productId: String(ent.productId ?? "").trim(),
        invoices: data.billing?.invoices ?? [],
        movements: data.billing?.movements ?? [],
      };

      setPayload(nextPayload);
      setStatusDraft(nextPayload.status.toLowerCase());
      setAmountDraft(
        nextPayload.total != null && Number.isFinite(nextPayload.total)
          ? nextPayload.total.toFixed(2).replace(".", ",")
          : ""
      );
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Erro ao carregar a fatura.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [params.uid]);

  const hasActiveInvoice = useMemo(
    () =>
      payload.invoices.some((invoice) => {
        const normalized = String(invoice.status ?? "").toLowerCase();
        return (
          !normalized.includes("cancel") &&
          normalized !== "3" &&
          String(invoice.provider ?? "").toLowerCase() === "bling"
        );
      }),
    [payload.invoices]
  );

  const paymentLabel = useMemo(() => {
    if (payload.paymentMethod) return payload.paymentMethod;
    if (payload.service) return payload.service;
    return "—";
  }, [payload.paymentMethod, payload.service]);

  const runAction = async (mode: "generate_invoice" | "change_status") => {
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Sessão inválida. Faça login novamente.");
      const parsedAmount = parseAmountDraft(amountDraft);
      const shouldSendAmount = amountDraft.trim().length > 0;

      const res = await fetch(`/api/admin/faturas/${params.uid}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode,
          status: statusDraft,
          comment: commentDraft,
          ...(shouldSendAmount ? { amount: parsedAmount } : {}),
        }),
      });

      const data = (await res.json()) as { ok: boolean; error?: string; message?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Não foi possível atualizar a fatura.");
      }

      setCommentDraft("");
      setSuccessMsg(
        mode === "generate_invoice"
          ? data.message || "Nota fiscal gerada com sucesso."
          : "Dados salvos com sucesso."
      );
      await load();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Erro ao atualizar a fatura.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell
      title="Fatura"
      subtitle={payload.aluno || "Gerenciamento financeiro da assinatura"}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => router.push("/admin/assinaturas")}>
            Voltar
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={saving || hasActiveInvoice}
            onClick={() => void runAction("generate_invoice")}
          >
            Gerar nota no Bling
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={saving}
            onClick={() => void runAction("change_status")}
          >
            Alterar status
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {loading ? (
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
            Carregando...
          </div>
        ) : (
          <>
            {errorMsg ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorMsg}
              </div>
            ) : null}

            {successMsg ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {successMsg}
              </div>
            ) : null}

            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-5 text-2xl font-black text-slate-900">Dados gerais</div>

              <div className="grid gap-4 md:grid-cols-3">
                <ReadonlyField label="Cód." value={payload.code} />
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Total
                  </div>
                  <input
                    value={amountDraft}
                    onChange={(e) => setAmountDraft(e.target.value)}
                    inputMode="decimal"
                    placeholder="0,01"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <div className="mt-1 text-xs text-slate-500">
                    Informe um valor manual para evitar emissão com total zerado.
                  </div>
                </div>
                <ReadonlyField label="Aluno" value={payload.aluno} />
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-4">
                <ReadonlyField label="Criado em" value={formatDate(payload.createdAt)} />
                <ReadonlyField label="Vencimento em" value={formatDate(payload.dueDate)} />
                <ReadonlyField label="Status" value={payload.status || "—"} />
                <ReadonlyField label="Forma de pagamento" value={paymentLabel} />
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Novo status
                  </div>
                  <select
                    value={statusDraft}
                    onChange={(e) => setStatusDraft(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="ativo">Ativo</option>
                    <option value="pendente">Pendente</option>
                    <option value="inativo">Inativo</option>
                    <option value="pago">Pago</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Comentário
                  </div>
                  <input
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder="Observação interna da movimentação"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>

              {hasActiveInvoice ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Já existe uma NFS-e ativa gerada para esta fatura. Use a tabela abaixo para abrir a nota antes de gerar outra.
                </div>
              ) : null}
            </section>

            <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-5 text-2xl font-black text-slate-900">
                Notas fiscais
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[760px] w-full text-sm">
                  <thead className="border-b bg-slate-100/80 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                    <tr>
                      <th className="px-5 py-4 text-left">Data</th>
                      <th className="px-5 py-4 text-left">Serviço</th>
                      <th className="px-5 py-4 text-left">Número NFSe</th>
                      <th className="px-5 py-4 text-left">Total</th>
                      <th className="px-5 py-4 text-left">Status</th>
                      <th className="px-5 py-4 text-left">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {payload.invoices.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                          Nenhuma nota fiscal gerada.
                        </td>
                      </tr>
                    ) : (
                      payload.invoices.map((invoice) => (
                        <tr key={invoice.id}>
                          <td className="px-5 py-4 text-slate-600">{formatDate(invoice.createdAt)}</td>
                          <td className="px-5 py-4 text-slate-700">{String(invoice.service ?? "—")}</td>
                          <td className="px-5 py-4 text-slate-700">{String(invoice.invoiceNumber ?? "—")}</td>
                          <td className="px-5 py-4 text-slate-700">
                            {formatCurrency(
                              typeof invoice.total === "number" ? invoice.total : null
                            )}
                          </td>
                          <td className="px-5 py-4 text-slate-700 uppercase">
                            {String(invoice.status ?? "—")}
                          </td>
                          <td className="px-5 py-4">
                            {invoice.link ? (
                              <a
                                href={String(invoice.link)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-700 transition hover:bg-slate-50"
                              >
                                Abrir nota
                              </a>
                            ) : invoice.providerId ? (
                              <span className="text-slate-500">Gerada no Bling</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-5 text-2xl font-black text-slate-900">
                Itens da fatura
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[720px] w-full text-sm">
                  <thead className="border-b bg-slate-100/80 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                    <tr>
                      <th className="px-5 py-4 text-left">Serviço</th>
                      <th className="px-5 py-4 text-left">Plano</th>
                      <th className="px-5 py-4 text-left">Produto Eduzz</th>
                      <th className="px-5 py-4 text-left">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-5 py-4 text-slate-700">{payload.service || "—"}</td>
                      <td className="px-5 py-4 text-slate-700">{payload.planCode || "—"}</td>
                      <td className="px-5 py-4 text-slate-700">{payload.productId || "—"}</td>
                      <td className="px-5 py-4 text-slate-700">{formatCurrency(payload.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-5 text-2xl font-black text-slate-900">
                Histórico de movimentações
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[760px] w-full text-sm">
                  <thead className="border-b bg-slate-100/80 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                    <tr>
                      <th className="px-5 py-4 text-left">Data</th>
                      <th className="px-5 py-4 text-left">Status</th>
                      <th className="px-5 py-4 text-left">Comentário</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {payload.movements.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-5 py-8 text-center text-slate-500">
                          Nenhuma movimentação registrada.
                        </td>
                      </tr>
                    ) : (
                      payload.movements.map((movement) => (
                        <tr key={movement.id}>
                          <td className="px-5 py-4 text-slate-600">{formatDate(movement.createdAt)}</td>
                          <td className="px-5 py-4 text-slate-700 uppercase">
                            {String(movement.status ?? "—")}
                          </td>
                          <td className="px-5 py-4 text-slate-700">{String(movement.comment ?? "—")}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </AdminShell>
  );
}
