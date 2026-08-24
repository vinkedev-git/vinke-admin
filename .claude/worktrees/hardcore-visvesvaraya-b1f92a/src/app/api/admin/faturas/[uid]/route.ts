export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminRoute";
import { generateBlingServiceInvoice } from "@/lib/bling";

function pickString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function pickNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(",", ".").trim();
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefinedDeep(item))
      .filter((item) => item !== undefined) as T;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .map(([key, nested]) => [key, stripUndefinedDeep(nested)]);

    return Object.fromEntries(entries) as T;
  }

  return value;
}

function nextEntitlementFlags(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "ativo") {
    return { active: true, pending: false };
  }
  if (normalized === "pendente") {
    return { active: false, pending: true };
  }
  return { active: false, pending: false };
}

function isCanceledInvoiceStatus(value: unknown) {
  const normalized = pickString(value).toLowerCase();
  return (
    normalized.includes("cancel") ||
    normalized === "3" ||
    normalized === "cancelada" ||
    normalized === "cancelado"
  );
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ uid: string }> }
) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  const { uid } = await context.params;

  try {
    const [userSnap, profileSnap, entitlementSnap, billingSnap] = await Promise.all([
      adminDb.collection("users").doc(uid).get(),
      adminDb.collection("users").doc(uid).collection("profile").doc("main").get(),
      adminDb.collection("entitlements").doc(uid).get(),
      adminDb.collection("billing_records").doc(uid).get(),
    ]);

    if (!userSnap.exists) {
      return NextResponse.json({ ok: false, error: "Aluno não encontrado." }, { status: 404 });
    }

    const billing = billingSnap.exists ? billingSnap.data() ?? {} : {};

    return NextResponse.json(
      {
        ok: true,
        aluno: {
          uid,
          user: userSnap.data() ?? {},
          profile: profileSnap.exists ? profileSnap.data() ?? {} : {},
          entitlement: entitlementSnap.exists ? entitlementSnap.data() ?? {} : {},
        },
        billing: {
          manualTotal: billing.manualTotal ?? null,
          invoices: ensureArray(billing.invoices),
          movements: ensureArray(billing.movements),
          updatedAt: billing.updatedAt ?? null,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar fatura.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ uid: string }> }
) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  const { uid } = await context.params;

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const mode = pickString(body.mode);
    const comment = pickString(body.comment);
    const status = pickString(body.status);
    const hasAmount = Object.prototype.hasOwnProperty.call(body, "amount");
    const amount = hasAmount ? pickNumber(body.amount) : null;

    if (hasAmount && (amount == null || amount < 0)) {
      return NextResponse.json(
        { ok: false, error: "Informe um valor válido para a fatura." },
        { status: 400 }
      );
    }

    const entRef = adminDb.collection("entitlements").doc(uid);
    const billingRef = adminDb.collection("billing_records").doc(uid);
    const userRef = adminDb.collection("users").doc(uid);
    const profileRef = adminDb.collection("users").doc(uid).collection("profile").doc("main");

    const [userSnap, profileSnap, entSnap, billingSnap] = await Promise.all([
      userRef.get(),
      profileRef.get(),
      entRef.get(),
      billingRef.get(),
    ]);

    if (!userSnap.exists) {
      return NextResponse.json({ ok: false, error: "Aluno não encontrado." }, { status: 404 });
    }

    const user = userSnap.data() ?? {};
    const profile = profileSnap.exists ? profileSnap.data() ?? {} : {};
    const entitlement = entSnap.exists ? entSnap.data() ?? {} : {};
    const billing = billingSnap.exists ? billingSnap.data() ?? {} : {};
    const invoices = ensureArray<Record<string, unknown>>(billing.invoices);
    const movements = ensureArray<Record<string, unknown>>(billing.movements);
    const now = new Date();
    const effectiveAmount =
      hasAmount && amount != null ? amount : pickNumber(billing.manualTotal) ?? pickNumber(entitlement.amountPaid);

    if (hasAmount && amount != null) {
      await Promise.all([
        entRef.set(
          {
            amountPaid: amount,
            updatedAt: now,
          },
          { merge: true }
        ),
        billingRef.set(
          {
            uid,
            manualTotal: amount,
            updatedAt: now,
          },
          { merge: true }
        ),
      ]);
    }

    if (mode === "generate_invoice") {
      const lastInvoice = invoices.length > 0 ? invoices[invoices.length - 1] : null;
      const lastTotal = lastInvoice ? pickNumber(lastInvoice.total) : null;
      const lastProvider = lastInvoice ? pickString(lastInvoice.provider) : "";

      if (
        lastInvoice &&
        lastProvider === "bling" &&
        !isCanceledInvoiceStatus(lastInvoice.status) &&
        lastTotal != null &&
        effectiveAmount != null &&
        Math.abs(lastTotal - effectiveAmount) < 0.0001
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Já existe uma NFS-e ativa para esta fatura com o mesmo valor. Abra a nota abaixo antes de gerar outra.",
          },
          { status: 409 }
        );
      }

      const result = await generateBlingServiceInvoice({
        uid,
        user,
        profile,
        entitlement,
        invoiceCode:
          pickString(entitlement.invoiceId) ||
          pickString(entitlement.lastEventId) ||
          uid,
        amountOverride: effectiveAmount,
      });

      const invoice = {
        id: result.providerId || `nf_${Date.now().toString(36)}`,
        createdAt: now,
        service: result.service,
        invoiceNumber: result.invoiceNumber || `NFSe-${String(invoices.length + 1).padStart(3, "0")}`,
        total: result.total ?? effectiveAmount,
        status: result.status || "emitida",
        provider: result.provider,
        providerId: result.providerId,
        link: result.link,
        requestPayload: stripUndefinedDeep(result.requestPayload),
        rawResponse: stripUndefinedDeep(result.rawResponse),
      };

      await billingRef.set(
        {
          uid,
          invoices: [...invoices, invoice],
          movements: [
            ...movements,
            {
              id: `mv_${Date.now().toString(36)}`,
              createdAt: now,
              status: "nota_fiscal_emitida_bling",
              comment:
                comment ||
                `Nota fiscal ${String(invoice.invoiceNumber)} gerada manualmente no Bling.`,
            },
          ],
          manualTotal: result.total ?? effectiveAmount ?? null,
          updatedAt: now,
        },
        { merge: true }
      );

      return NextResponse.json(
        {
          ok: true,
          message: `Nota fiscal ${String(invoice.invoiceNumber)} gerada no Bling com sucesso.`,
          invoice,
        },
        { status: 200 }
      );
    }

    if (mode === "change_status") {
      if (!status) {
        return NextResponse.json({ ok: false, error: "Status é obrigatório." }, { status: 400 });
      }

      const flags = nextEntitlementFlags(status);

      await Promise.all([
        entRef.set(
          {
            invoiceStatus: status,
            active: flags.active,
            pending: flags.pending,
            ...(effectiveAmount != null ? { amountPaid: effectiveAmount } : {}),
            updatedAt: now,
          },
          { merge: true }
        ),
        billingRef.set(
          {
            uid,
            movements: [
              ...movements,
              {
                id: `mv_${Date.now().toString(36)}`,
                createdAt: now,
                status,
                comment: comment || "Status alterado manualmente no painel.",
              },
            ],
            ...(effectiveAmount != null ? { manualTotal: effectiveAmount } : {}),
            updatedAt: now,
          },
          { merge: true }
        ),
      ]);

      return NextResponse.json({ ok: true }, { status: 200 });
    }

    return NextResponse.json({ ok: false, error: "Operação inválida." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar fatura.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
