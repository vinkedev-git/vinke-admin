export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminRoute";

type EduzzProduct = {
  id: string;
  name: string;
  status: string;
  price: number | null;
  currency: string;
  moderation: string;
  paymentType: string;
  imageUrl: string | null;
  description: string | null;
};

function pickString(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
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

function normalizeStatus(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "inativo";

  const inactiveFlags = [
    "inativo",
    "inactive",
    "desativado",
    "disabled",
    "blocked",
    "bloqueado",
    "paused",
    "cancel",
    "canceled",
    "cancelled",
    "closed",
  ];
  if (inactiveFlags.some((flag) => normalized.includes(flag))) return "inativo";

  const activeFlags = ["ativo", "active", "approved", "publicado", "enabled", "available"];
  if (activeFlags.some((flag) => normalized.includes(flag))) return "ativo";

  return "inativo";
}

function pickBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (!v) return null;
    if (["true", "1", "yes", "sim", "active", "ativo", "enabled"].includes(v)) return true;
    if (["false", "0", "no", "nao", "não", "inactive", "inativo", "disabled"].includes(v))
      return false;
  }
  return null;
}

function extractEduzzStatus(item: Record<string, unknown>) {
  const statusText = pickString(
    item.status ??
      item.productStatus ??
      item.saleStatus ??
      item.situation ??
      item.state ??
      item.currentStatus
  );
  if (statusText) return statusText;

  const activeFlag = pickBoolean(
    item.isActive ??
      item.active ??
      item.enabled ??
      item.available ??
      item.is_enabled ??
      item.is_available
  );

  if (activeFlag === true) return "active";
  if (activeFlag === false) return "inactive";
  return "";
}

function normalizePaymentType(value: string) {
  if (!value) return "";
  const normalized = value.toLowerCase();
  if (normalized === "recurrency" || normalized === "recurring") return "Recorrente";
  if (normalized === "single") return "Pagamento único";
  return value;
}

function mapProductsFromPayload(payload: Record<string, unknown>): EduzzProduct[] {
  const candidates = [
    payload.items,
    payload.data,
    payload.products,
    (payload.data as Record<string, unknown> | undefined)?.items,
    (payload.data as Record<string, unknown> | undefined)?.products,
  ];

  const list = candidates.find((item) => Array.isArray(item));
  if (!Array.isArray(list)) return [];

  return list
    .map((raw) => {
      const item = (raw ?? {}) as Record<string, unknown>;
      const paymentNode = (item.payment ?? {}) as Record<string, unknown>;
      const priceNode =
        (paymentNode.price as Record<string, unknown> | undefined) ??
        (item.price as Record<string, unknown> | undefined) ??
        {};
      const status = extractEduzzStatus(item);
      const id = pickString(item.id);
      const name = pickString(item.name || item.title);

      if (!id || !name) return null;

      return {
        id,
        name,
        status,
        price: pickNumber(priceNode.value ?? item.price),
        currency: pickString(priceNode.currency) || "BRL",
        moderation: pickString(item.moderationStatus || item.moderation || item.approvalStatus),
        paymentType: normalizePaymentType(
          pickString(
            paymentNode.type || item.paymentType || item.billingType || item.billing_type
          )
        ),
        imageUrl: pickString(item.imageUrl || item.image || item.logo) || null,
        description: pickString(item.description) || null,
      } satisfies EduzzProduct;
    })
    .filter((item): item is EduzzProduct => item !== null);
}

async function fetchAllEduzzProducts(baseUrl: string, token: string) {
  const pagesToTry = [1, 2, 3, 4, 5];
  const products: EduzzProduct[] = [];

  for (const page of pagesToTry) {
    const url = new URL("/myeduzz/v1/products", baseUrl);
    url.searchParams.set("page", String(page));
    url.searchParams.set("itemsPerPage", "100");

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Eduzz API error (${res.status}): ${text || "sem detalhe"}`);
    }

    const payload = (await res.json()) as Record<string, unknown>;
    const batch = mapProductsFromPayload(payload);

    if (!batch.length) {
      if (page === 1) {
        throw new Error("A API da Eduzz respondeu, mas não retornou produtos em um formato reconhecido.");
      }
      break;
    }

    products.push(...batch);

    const totalPages = pickNumber(
      payload.pages ??
        (payload.pagination as Record<string, unknown> | undefined)?.totalPages ??
        (payload.meta as Record<string, unknown> | undefined)?.totalPages
    );

    if (totalPages && page >= totalPages) {
      break;
    }
  }

  return products;
}

export async function POST(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  const baseUrl = process.env.EDUZZ_API_BASE_URL || "https://api.eduzz.com";
  const token =
    process.env.EDUZZ_USER_TOKEN ||
    process.env.EDUZZ_PERSONAL_TOKEN ||
    process.env.EDUZZ_API_TOKEN ||
    process.env.EDUZZ_BEARER_TOKEN ||
    "";

  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Configure EDUZZ_USER_TOKEN (ou EDUZZ_PERSONAL_TOKEN / EDUZZ_API_TOKEN) no ambiente para sincronizar os produtos.",
      },
      { status: 400 }
    );
  }

  try {
    const products = await fetchAllEduzzProducts(baseUrl, token);
    const snap = await adminDb.collection("catalog_planos").get();
    const byProductId = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();

    snap.docs.forEach((doc) => {
      const productId = pickString(doc.data()?.productId);
      if (productId) {
        byProductId.set(productId, doc);
      }
    });

    const now = new Date();
    let updated = 0;
    let created = 0;

    for (const [index, product] of products.entries()) {
      const existing = byProductId.get(product.id);
      const ref = existing
        ? existing.ref
        : adminDb.collection("catalog_planos").doc(`eduzz_${product.id}`);

      await ref.set(
        {
          code: existing?.data()?.code ?? String(index + 1),
          title: product.name,
          productId: product.id,
          description: product.description,
          imageUrl: product.imageUrl,
          moderation: product.moderation || null,
          paymentType: product.paymentType || null,
          source: "eduzz",
          status: normalizeStatus(product.status),
          price: product.price,
          currency: product.currency || "BRL",
          createdAt: existing?.data()?.createdAt ?? now,
          updatedAt: now,
          lastSyncedAt: now,
        },
        { merge: true }
      );

      if (existing) {
        updated += 1;
      } else {
        created += 1;
      }
    }

    return NextResponse.json(
      {
        ok: true,
        created,
        updated,
        total: products.length,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao sincronizar produtos da Eduzz.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
