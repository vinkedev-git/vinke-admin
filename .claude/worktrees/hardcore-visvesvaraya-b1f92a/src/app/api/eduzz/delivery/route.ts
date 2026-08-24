// src/app/api/eduzz/delivery/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { Resend } from "resend";

type EduzzEnvelope = {
  id?: string;
  event?: string; // ex: "myeduzz.invoice_paid"
  sentDate?: string;
  data?: Record<string, unknown>;
};

// ---------- helpers ----------
function pickFirstString(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

function normalizeEmail(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function safeJson(obj: unknown) {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return { raw: String(obj) };
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function getSecretFromRequest(req: NextRequest, body: any): string {
  const h =
    req.headers.get("x-eduzz-secret") ||
    req.headers.get("x-webhook-secret") ||
    req.headers.get("x-hook-secret") ||
    req.headers.get("authorization") ||
    "";

  const headerSecret = h.startsWith("Bearer ") ? h.slice(7).trim() : h.trim();

  const b = body ?? {};
  const bodySecret =
    pickFirstString(
      b?.edz_cli_origin_secret,
      b?.origin_secret,
      b?.webhook_secret,
      b?.secret,
      b?.data?.edz_cli_origin_secret
    ) || "";

  return headerSecret || bodySecret;
}

async function readBody(req: NextRequest): Promise<any> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return await req.json();
  }
  const fd = await req.formData();
  const fields: Record<string, unknown> = {};
  fd.forEach((val, key) => {
    fields[key] = typeof val === "string" ? val : "";
  });
  const parsedData = parseJsonObject(fields.data);
  if (parsedData) {
    fields.data = parsedData;
  }
  return fields;
}

function extractFromEnvelope(raw: any): {
  envelopeId: string;
  event: string;
  data: Record<string, unknown>;
  sentDate: string;
} {
  const envelopeId = pickFirstString(
    raw?.id,
    raw?.event_id,
    raw?.nsid,
    raw?.sid,
    raw?.edz_evt_cod,
    raw?.edz_event_id
  );
  const event = pickFirstString(
    raw?.event,
    raw?.type,
    raw?.name,
    raw?.event_name,
    raw?.eventType,
    raw?.edz_evt_name,
    raw?.edz_event,
    raw?.edz_evt_type
  ).toLowerCase();

  const data = (
    raw?.data && typeof raw.data === "object"
      ? raw.data
      : raw?.fields && typeof raw.fields === "object"
        ? raw.fields
        : raw && typeof raw === "object"
          ? raw
          : {}
  ) as
    | Record<string, unknown>
    | undefined;

  const sentDate = pickFirstString(raw?.sentDate, raw?.sent_date, raw?.createdAt, raw?.created_at);

  return {
    envelopeId: envelopeId || `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    event,
    data: data ?? {},
    sentDate: sentDate || new Date().toISOString(),
  };
}

function normalizeToken(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isPaidLike(value: unknown): boolean {
  const normalized = normalizeToken(value);
  if (!normalized) return false;
  return (
    normalized.includes("paid") ||
    normalized.includes("pago") ||
    normalized.includes("approved") ||
    normalized.includes("aprov") ||
    normalized.includes("complete") ||
    normalized.includes("conclu") ||
    normalized.includes("success") ||
    normalized.includes("sucesso") ||
    normalized.includes("confirm") ||
    normalized.includes("liberad") ||
    normalized.includes("settled") ||
    normalized.includes("liquid") ||
    normalized.includes("authorized") ||
    normalized.includes("autoriz") ||
    normalized === "2"
  );
}

function isCancelledLike(value: unknown): boolean {
  const normalized = normalizeToken(value);
  if (!normalized) return false;
  return (
    normalized.includes("cancel") ||
    normalized.includes("refunded") ||
    normalized.includes("reembols") ||
    normalized.includes("chargeback") ||
    normalized.includes("estorn") ||
    normalized.includes("expired") ||
    normalized.includes("expirad") ||
    normalized.includes("overdue") ||
    normalized.includes("vencid") ||
    normalized === "3"
  );
}

function mapEventToAction(params: {
  event: string;
  invoiceStatus: string | null;
}): "activate" | "deactivate" | "ignore" {
  const event = normalizeToken(params.event);
  const invoiceStatus = normalizeToken(params.invoiceStatus);

  if (event.includes("invoice_paid") || event.includes("invoice_approved")) return "activate";
  if (event.includes("invoice_canceled") || event.includes("invoice_cancelled")) return "deactivate";

  if (event.includes("invoice") || event.includes("payment") || event.includes("sale")) {
    if (isCancelledLike(event) || isCancelledLike(invoiceStatus)) return "deactivate";
    if (isPaidLike(event) || isPaidLike(invoiceStatus)) return "activate";
  }

  if (isCancelledLike(invoiceStatus)) return "deactivate";
  if (isPaidLike(invoiceStatus)) return "activate";

  return "ignore";
}

function toDateOrNull(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const s = String(v);
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

const STATE_NAME_BY_UF: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

const STATE_NAME_BY_NORMALIZED: Record<string, string> = Object.fromEntries(
  Object.values(STATE_NAME_BY_UF).map((name) => [
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase(),
    name,
  ])
);

function normalizeStateName(value: unknown): string | null {
  const raw = pickFirstString(value);
  if (!raw) return null;

  const upper = raw.toUpperCase();
  if (STATE_NAME_BY_UF[upper]) {
    return STATE_NAME_BY_UF[upper];
  }

  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return STATE_NAME_BY_NORMALIZED[normalized] || raw;
}

function resolveAddressSource(...sources: Array<Record<string, unknown> | null | undefined>) {
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;

    const nested = source.address;
    if (nested && typeof nested === "object") {
      const nestedAddress = nested as Record<string, unknown>;
      const hasNestedValue = [
        nestedAddress.street,
        nestedAddress.number,
        nestedAddress.neighborhood,
        nestedAddress.complement,
        nestedAddress.city,
        nestedAddress.state,
        nestedAddress.zipCode,
        nestedAddress.country,
      ].some((value) => pickFirstString(value));

      if (hasNestedValue) {
        return nestedAddress;
      }
    }

    const flatSource = source as Record<string, unknown>;
    const hasFlatValue = [
      flatSource.street,
      flatSource.number,
      flatSource.neighborhood,
      flatSource.complement,
      flatSource.city,
      flatSource.state,
      flatSource.zipCode,
      flatSource.country,
    ].some((value) => pickFirstString(value));

    if (hasFlatValue) {
      return flatSource;
    }
  }

  return {};
}

async function resolvePlanMatch(params: {
  db: FirebaseFirestore.Firestore;
  productId: string | null;
  productTitle: string | null;
}) {
  const { db, productId, productTitle } = params;

  if (productId) {
    const byProductId = await db
      .collection("catalog_planos")
      .where("productId", "==", productId)
      .limit(1)
      .get();

    if (!byProductId.empty) {
      const doc = byProductId.docs[0];
      return {
        planId: doc.id,
        planTitle: String(doc.data()?.title ?? "").trim() || productTitle || null,
        matchedBy: "productId" as const,
      };
    }
  }

  if (productTitle) {
    const byTitle = await db
      .collection("catalog_planos")
      .where("title", "==", productTitle)
      .limit(1)
      .get();

    if (!byTitle.empty) {
      const doc = byTitle.docs[0];
      return {
        planId: doc.id,
        planTitle: String(doc.data()?.title ?? "").trim() || productTitle,
        matchedBy: "title" as const,
      };
    }
  }

  return {
    planId: null,
    planTitle: productTitle,
    matchedBy: null,
  };
}

function htmlEmail(params: { appName: string; createPasswordUrl: string; loginUrl: string }) {
  const { appName, createPasswordUrl, loginUrl } = params;
  return `
  <div style="font-family: Arial, sans-serif; line-height:1.5; color:#0f172a">
    <h2 style="margin:0 0 12px 0">${appName}</h2>
    <p style="margin:0 0 16px 0">Seu acesso foi liberado ✅</p>
    <p style="margin:0 0 16px 0">Para criar sua senha e entrar, clique no botão abaixo:</p>
    <p style="margin:0 0 18px 0">
      <a href="${createPasswordUrl}"
         style="display:inline-block; padding:12px 16px; background:#0f172a; color:#fff; text-decoration:none; border-radius:10px; font-weight:700">
        Criar minha senha
      </a>
    </p>
    <p style="margin:0 0 10px 0; font-size:13px; color:#334155">
      Depois de criar a senha, você pode entrar aqui:
      <a href="${loginUrl}">${loginUrl}</a>
    </p>
    <p style="margin:18px 0 0 0; font-size:12px; color:#64748b">
      Se você não solicitou este acesso, pode ignorar este e-mail.
    </p>
  </div>
  `;
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error ?? "erro desconhecido").slice(0, 500);
}

function resolveResendFrom(value: string) {
  const from = value.trim();
  if (!from) return "";
  if (from.includes("<") && from.includes(">")) return from;
  return `Anestesia Questões <${from}>`;
}

// ---------- handlers ----------
export async function GET() {
  return NextResponse.json({ ok: true, service: "eduzz-delivery" }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const APP_URL = process.env.APP_URL || "";
  const EDUZZ_WEBHOOK_SECRET =
    process.env.EDUZZ_WEBHOOK_SECRET || process.env.EDUZZ_ORIGIN_SECRET || "";
  const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
  const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "";

  try {
    const rawBody = await readBody(req);
    const { envelopeId, event, data, sentDate } = extractFromEnvelope(rawBody);
    const source: any = data && Object.keys(data).length > 0 ? data : rawBody;
    const nestedData = parseJsonObject(source?.data);
    const sourceData = nestedData ?? source;

    // 1) Validar secret (quando a Eduzz mandar)
    const receivedSecret = getSecretFromRequest(req, rawBody);
    const canValidate = Boolean(EDUZZ_WEBHOOK_SECRET);
    const hasSecret = Boolean(receivedSecret);

    if (canValidate && hasSecret && receivedSecret !== EDUZZ_WEBHOOK_SECRET) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized", debug: { envelopeId, event } },
        { status: 401 }
      );
    }

    const invoiceStatus =
      pickFirstString(
        sourceData?.invoice?.status,
        sourceData?.invoice_status,
        sourceData?.status,
        sourceData?.edz_fat_status
      ) || null;
    const action = mapEventToAction({ event, invoiceStatus });
    const db = adminDb;

    // 2) Log do evento (sempre salva)
    await db.collection("eduzz_events").doc(envelopeId).set(
      {
        receivedAt: new Date(),
        sentDate,
        event,
        action,
        invoiceStatus,
        secretPresent: hasSecret,
        raw: safeJson(rawBody),
      },
      { merge: true }
    );

    // 3) Só processa entitlement/usuario no invoice_paid (e invoice_canceled pra desativar)
    if (action === "ignore") {
      await db.collection("eduzz_events").doc(envelopeId).set(
        {
          processed: false,
          reason: "ignored_event",
        },
        { merge: true }
      );
      return NextResponse.json(
        { ok: true, processed: false, reason: "ignored_event", event },
        { status: 200 }
      );
    }

    // --------- EXTRAÇÕES (email, plano, valor, vencimento, perfil) ---------
    const email = normalizeEmail(
      sourceData?.student?.email ??
        sourceData?.customer?.email ??
        sourceData?.buyer?.email ??
        sourceData?.client?.email ??
        sourceData?.email ??
        sourceData?.edz_cli_email ??
        sourceData?.buyer_email ??
        sourceData?.customer_email ??
        sourceData?.client_email
    );

    if (!email) {
      await db.collection("eduzz_events").doc(envelopeId).set(
        {
          processed: false,
          reason: "missing_email",
        },
        { merge: true }
      );
      return NextResponse.json(
        { ok: false, error: "Missing email", event, envelopeId },
        { status: 400 }
      );
    }

    const invoiceId =
      pickFirstString(sourceData?.invoice?.id, sourceData?.invoice_id, sourceData?.edz_fat_cod) || null;

    // Plano/produto (vários formatos)
    const productFromItems =
      Array.isArray(sourceData?.items) && sourceData?.items?.length ? sourceData?.items?.[0] : null;
    const productIdFromItemDiscount =
      Array.isArray(sourceData?.items) && sourceData?.items?.length
        ? (sourceData.items as Array<any>)
            .map((item) =>
              pickFirstString(
                item?.price?.discount?.productId,
                item?.price?.discount?.productID,
                item?.discount?.productId
              )
            )
            .find(Boolean) || null
        : null;

    const productId =
      pickFirstString(
        sourceData?.product?.id,
        sourceData?.product_id,
        sourceData?.offer?.id,
        sourceData?.offer_id,
        sourceData?.edz_cnt_cod,
        productFromItems?.productId,
        productFromItems?.id,
        productIdFromItemDiscount
      ) || null;

    const productTitle =
      pickFirstString(
        sourceData?.product?.title,
        sourceData?.product_title,
        sourceData?.offer?.title,
        sourceData?.offer_title,
        sourceData?.edz_cnt_titulo,
        productFromItems?.name
      ) || null;

    // Valor pago (quando existir)
    const currency =
      pickFirstString(
        sourceData?.price?.paid?.currency,
        sourceData?.price?.currency,
        sourceData?.currency
      ) || "BRL";

    const amountPaid =
      (typeof sourceData?.price?.paid?.value === "number" ? sourceData?.price?.paid?.value : null) ??
      (typeof sourceData?.price?.value === "number" ? sourceData?.price?.value : null) ??
      null;
    const paymentMethod =
      pickFirstString(
        sourceData?.paymentMethod,
        sourceData?.payment?.method,
        sourceData?.invoice?.paymentMethod
      ) || null;

    // Vencimento (até data X) – vem muito como contract.dueDate ou dueDate
    const dueDateRaw = sourceData?.dueDate || sourceData?.contract?.dueDate || null;
    const paidAtRaw = sourceData?.paidAt || sourceData?.payment?.paidAt || null;

    const paidAt = toDateOrNull(paidAtRaw);
    const dueDate = toDateOrNull(dueDateRaw);
    const validUntil = paidAt
      ? addMonths(paidAt, 12)
      : dueDate
        ? addMonths(dueDate, 12)
        : null;

    // Perfil do aluno: prioriza student para identidade, mas usa fallback de endereço do buyer/customer
    const studentProfile = sourceData?.student || {};
    const buyerProfile = sourceData?.buyer || {};
    const customerProfile = sourceData?.customer || sourceData?.client || {};
    const profileSource =
      Object.keys(studentProfile).length > 0
        ? studentProfile
        : Object.keys(buyerProfile).length > 0
          ? buyerProfile
          : customerProfile;
    const address = resolveAddressSource(
      profileSource,
      buyerProfile,
      customerProfile,
      sourceData?.address as Record<string, unknown> | undefined
    );

    const profilePayload = {
      name: pickFirstString(profileSource?.name, sourceData?.name) || null,
      phone: pickFirstString(
        profileSource?.phone,
        profileSource?.cellphone,
        profileSource?.phone2,
        buyerProfile?.phone,
        buyerProfile?.cellphone
      ) || null,
      document: pickFirstString(profileSource?.document, buyerProfile?.document) || null,
      address: {
        street: pickFirstString(address?.street) || null,
        number: pickFirstString(address?.number) || null,
        complement: pickFirstString(address?.complement) || null,
        neighborhood: pickFirstString(address?.neighborhood) || null,
        city: pickFirstString(address?.city) || null,
        state: normalizeStateName(address?.state),
        zipCode: pickFirstString(address?.zipCode) || null,
        country: pickFirstString(address?.country) || null,
      },
      updatedAt: new Date(),
      source: "eduzz",
    };

    // 4) Garantir usuário no Firebase Auth
    let uid = "";
    try {
      const u = await adminAuth.getUserByEmail(email);
      uid = u.uid;
    } catch {
      const created = await adminAuth.createUser({
        email,
        emailVerified: true,
      });
      uid = created.uid;
    }

    const entRef = db.collection("entitlements").doc(uid);
    const now = new Date();
    const planMatch = await resolvePlanMatch({
      db,
      productId,
      productTitle,
    });

    if (action === "activate") {
      // ✅ ENTITLEMENT com vencimento + plano/valor
      await entRef.set(
        {
          uid,
          email,
          active: true,
          pending: false,
          source: "eduzz",
          planId: planMatch.planId,
          productId,
          productTitle: planMatch.planTitle,
          planMatchedBy: planMatch.matchedBy,
          invoiceId,
          invoiceStatus,
          amountPaid,
          paymentMethod,
          currency,
          paidAt: paidAt ?? null,
          validUntil: validUntil ?? null, // ✅ vencimento até
          updatedAt: now,
          lastEvent: event,
          lastEventId: envelopeId,
        },
        { merge: true }
      );

      // 5) E-mail 1x com link para criar senha (se configurado)
      let welcomeEmailStatus:
        | { status: "sent" | "skipped" | "failed"; reason?: string; error?: string }
        | undefined;

      if (RESEND_API_KEY && RESEND_FROM_EMAIL && APP_URL) {
        try {
          const entSnap = await entRef.get();
          const alreadySent = Boolean(entSnap.exists && entSnap.data()?.welcomeEmailSentAt);

          if (!alreadySent) {
            const actionCodeSettings = {
              url: `${APP_URL}/aluno/entrar?email=${encodeURIComponent(email)}`,
              handleCodeInApp: false,
            };

            let createPasswordUrl = "";
            try {
              createPasswordUrl = await adminAuth.generatePasswordResetLink(email, actionCodeSettings);
            } catch (err) {
              console.error("ERROR generating reset link:", err);
              createPasswordUrl = `${APP_URL}/aluno/entrar`;
            }

            try {
              const resend = new Resend(RESEND_API_KEY);

              await resend.emails.send({
                from: resolveResendFrom(RESEND_FROM_EMAIL),
                to: email,
                subject: "Seu acesso foi liberado — crie sua senha",
                html: htmlEmail({
                  appName: "Anestesia Questões",
                  createPasswordUrl,
                  loginUrl: `${APP_URL}/aluno/entrar`,
                }),
              });

              await entRef.set(
                {
                  welcomeEmailSentAt: new Date(),
                  welcomeEmailTo: email,
                  welcomeEmailStatus: "sent",
                  welcomeEmailError: null,
                },
                { merge: true }
              );

              welcomeEmailStatus = { status: "sent" };
            } catch (err) {
              console.error("ERROR sending email via Resend:", err);
              await entRef.set(
                {
                  welcomeEmailStatus: "failed",
                  welcomeEmailError: safeErrorMessage(err),
                },
                { merge: true }
              );
              welcomeEmailStatus = {
                status: "failed",
                reason: "resend_send_error",
                error: safeErrorMessage(err),
              };
            }
          } else {
            welcomeEmailStatus = { status: "skipped", reason: "already_sent" };
          }
        } catch (err) {
          console.error("EMAIL BLOCK ERROR:", err);
          welcomeEmailStatus = {
            status: "failed",
            reason: "email_block_error",
            error: safeErrorMessage(err),
          };
        }
      } else {
        const missing = [
          !RESEND_API_KEY ? "RESEND_API_KEY" : "",
          !RESEND_FROM_EMAIL ? "RESEND_FROM_EMAIL" : "",
          !APP_URL ? "APP_URL" : "",
        ].filter(Boolean);
        welcomeEmailStatus = {
          status: "skipped",
          reason: `missing_config:${missing.join(",")}`,
        };
      }

      // 6) users/{uid} (portal aluno) + profile em subcoleção
      const userRef = db.collection("users").doc(uid);
      const userSnap = await userRef.get();
      const existingRole =
        userSnap.exists && typeof userSnap.data()?.role === "string"
          ? String(userSnap.data()?.role)
          : null;

      await userRef.set(
        {
          uid,
          email,
          role: existingRole === "admin" ? "admin" : "student",
          updatedAt: now,
          createdAt: userSnap.exists ? userSnap.data()?.createdAt ?? now : now,
        },
        { merge: true }
      );

      // ✅ PERFIL vindo da Eduzz (pra página Perfil do aluno)
      // guarda em users/{uid}/profile/main
      await db
        .collection("users")
        .doc(uid)
        .collection("profile")
        .doc("main")
        .set(profilePayload, { merge: true });

      await db.collection("eduzz_events").doc(envelopeId).set(
        {
          processed: true,
          reason: "activated",
          uid,
          email,
          welcomeEmailStatus: welcomeEmailStatus?.status ?? "skipped",
          welcomeEmailReason: welcomeEmailStatus?.reason ?? null,
          welcomeEmailError: welcomeEmailStatus?.error ?? null,
        },
        { merge: true }
      );

      return NextResponse.json({ ok: true, processed: true, action: "activate", uid }, { status: 200 });
    }

    // action === "deactivate"
    await entRef.set(
      {
        uid,
        email,
        active: false,
        pending: false,
        source: "eduzz",
        planId: planMatch.planId,
        productId,
        productTitle: planMatch.planTitle,
        planMatchedBy: planMatch.matchedBy,
        invoiceId,
        invoiceStatus,
        amountPaid,
        paymentMethod,
        currency,
        paidAt: paidAt ?? null,
        validUntil: validUntil ?? null,
        updatedAt: now,
        lastEvent: event,
        lastEventId: envelopeId,
      },
      { merge: true }
    );

    await db.collection("eduzz_events").doc(envelopeId).set(
      {
        processed: true,
        reason: "deactivated",
        uid,
        email,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, processed: true, action: "deactivate", uid }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Internal error", message: e?.message || String(e) },
      { status: 500 }
    );
  }
}
