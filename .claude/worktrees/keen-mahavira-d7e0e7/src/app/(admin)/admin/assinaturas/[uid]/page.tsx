"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import { Button } from "@/components/ui/Button";
import { dateFromUnknown } from "@/lib/dateValue";
import { auth } from "@/lib/firebase";

type Plano = {
  id: string;
  title?: string | null;
  productId?: string | null;
  code?: string | null;
  status?: "ativo" | "inativo";
  price?: number | null;
};

type AssinaturaForm = {
  aluno: string;
  email: string;
  source: string;
  active: boolean;
  pending: boolean;
  planId: string;
  productId: string;
  productTitle: string;
  invoiceStatus: string;
  amountPaid: string;
  validUntil: string;
};

const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const INVOICE_STATUS_LABEL: Record<string, string> = {
  paid: "PAGO",
  pending: "PENDENTE",
  refunded: "REEMBOLSADO",
  canceled: "CANCELADO",
  chargeback: "CHARGEBACK",
  active: "ATIVO",
  inactive: "INATIVO",
};

function formatBRL(value: number) {
  return CURRENCY_FORMATTER.format(value);
}

function parseBRL(value: string) {
  const cleaned = value.replace(/[^\d,-.]/g, "").trim();
  if (!cleaned) return null;
  if (cleaned.includes(",")) {
    const normalized = cleaned.replace(/\./g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeInvoiceStatus(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "pago") return "paid";
  if (raw === "pendente") return "pending";
  if (raw === "reembolsado") return "refunded";
  if (raw === "cancelado") return "canceled";
  if (raw === "ativo") return "active";
  if (raw === "inativo") return "inactive";
  return raw;
}

function invoiceStatusLabel(value: string) {
  return INVOICE_STATUS_LABEL[value] || value.toUpperCase();
}

function formatDateInput(value: unknown) {
  const parsed = dateFromUnknown(value);
  if (!parsed) return "";
  return parsed.toISOString().slice(0, 10);
}

export default function EditarAssinaturaPage() {
  const params = useParams<{ uid: string }>();
  const router = useRouter();

  const [plans, setPlans] = useState<Plano[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [form, setForm] = useState<AssinaturaForm>({
    aluno: "",
    email: "",
    source: "admin",
    active: false,
    pending: true,
    planId: "",
    productId: "",
    productTitle: "",
    invoiceStatus: "",
    amountPaid: "",
    validUntil: "",
  });

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error("Sessão inválida. Faça login novamente.");

        const res = await fetch(`/api/admin/assinaturas/${params.uid}`, {
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
          plans?: Plano[];
        };

        if (!res.ok || !data.ok || !data.aluno) {
          throw new Error(data.error || "Não foi possível carregar a assinatura.");
        }

        const user = data.aluno.user ?? {};
        const profile = data.aluno.profile ?? {};
        const ent = data.aluno.entitlement ?? {};

        if (!active) return;

        setPlans((data.plans || []).filter((item) => item.status !== "inativo"));
        setForm({
          aluno:
            String(profile.name ?? "").trim() ||
            String(user.name ?? "").trim() ||
            "Aluno sem nome",
          email: String(user.email ?? ent.email ?? "").trim(),
          source: String(ent.source ?? "admin"),
          active: ent.active === true,
          pending: ent.pending === true,
          planId: String(ent.planId ?? ""),
          productId: String(ent.productId ?? ""),
          productTitle: String(ent.productTitle ?? ""),
          invoiceStatus: normalizeInvoiceStatus(ent.invoiceStatus),
          amountPaid:
            ent.amountPaid != null && Number.isFinite(Number(ent.amountPaid))
              ? formatBRL(Number(ent.amountPaid))
              : "",
          validUntil: formatDateInput(ent.validUntil),
        });
      } catch (error) {
        if (active) {
          setErrorMsg(error instanceof Error ? error.message : "Erro ao carregar assinatura.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [params.uid]);

  const canSave = useMemo(() => !saving && form.email.trim().length > 0, [form.email, saving]);

  const onSelectPlan = (planId: string) => {
    const selected = plans.find((plan) => plan.id === planId);
    setForm((prev) => ({
      ...prev,
      planId,
      productId: selected?.productId || prev.productId,
      productTitle: selected?.title || prev.productTitle,
          amountPaid:
        selected?.price != null && prev.source === "admin"
          ? formatBRL(selected.price)
          : prev.amountPaid,
    }));
  };

  const onSave = async () => {
    if (!canSave) return;

    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Sessão inválida. Faça login novamente.");

      const res = await fetch(`/api/admin/assinaturas/${params.uid}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: form.email,
          active: form.active,
          pending: form.pending,
          planId: form.planId,
          productId: form.productId,
          productTitle: form.productTitle,
          invoiceStatus: form.invoiceStatus,
          amountPaid: parseBRL(form.amountPaid),
          validUntil: form.validUntil,
        }),
      });

      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Não foi possível salvar a assinatura.");
      }

      setSuccessMsg("Dados salvos com sucesso.");
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Erro ao salvar assinatura.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell
      title="Editar assinatura"
      subtitle={form.aluno || "Carregando assinatura"}
      actions={
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => router.push("/admin/assinaturas")}>
            Voltar
          </Button>
          <Button variant="primary" size="sm" onClick={onSave} disabled={!canSave}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      }
    >
      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        {loading ? (
          <div className="text-sm text-slate-500">Carregando...</div>
        ) : (
          <div className="space-y-6">
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

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Aluno
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-800">
                  {form.aluno}
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Origem
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base uppercase text-slate-800">
                  {form.source}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  E-mail
                </div>
                <input
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      active: true,
                      pending: false,
                    }))
                  }
                  className={
                    form.active
                      ? "rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700"
                      : "rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600"
                  }
                >
                  Ativar
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      active: false,
                      pending: true,
                    }))
                  }
                  className={
                    form.pending
                      ? "rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700"
                      : "rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600"
                  }
                >
                  Pendente
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Plano
                </div>
                <select
                  value={form.planId}
                  onChange={(e) => onSelectPlan(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="">Selecione</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Produto Eduzz
                </div>
                <input
                  value={form.productId}
                  onChange={(e) => setForm((prev) => ({ ...prev, productId: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Título do plano
                </div>
                <input
                  value={form.productTitle}
                  onChange={(e) => setForm((prev) => ({ ...prev, productTitle: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Valor pago
                </div>
                <input
                  value={form.amountPaid}
                  onChange={(e) => setForm((prev) => ({ ...prev, amountPaid: e.target.value }))}
                  onBlur={(e) => {
                    const parsed = parseBRL(e.target.value);
                    if (parsed == null) return;
                    setForm((prev) => ({ ...prev, amountPaid: formatBRL(parsed) }));
                  }}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Válido até
                </div>
                <input
                  type="date"
                  value={form.validUntil}
                  onChange={(e) => setForm((prev) => ({ ...prev, validUntil: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Status da fatura
              </div>
              <select
                value={normalizeInvoiceStatus(form.invoiceStatus)}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, invoiceStatus: e.target.value }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="">Selecione</option>
                <option value="paid">{invoiceStatusLabel("paid")}</option>
                <option value="pending">{invoiceStatusLabel("pending")}</option>
                <option value="refunded">{invoiceStatusLabel("refunded")}</option>
                <option value="canceled">{invoiceStatusLabel("canceled")}</option>
                <option value="chargeback">{invoiceStatusLabel("chargeback")}</option>
                <option value="active">{invoiceStatusLabel("active")}</option>
                <option value="inactive">{invoiceStatusLabel("inactive")}</option>
              </select>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
