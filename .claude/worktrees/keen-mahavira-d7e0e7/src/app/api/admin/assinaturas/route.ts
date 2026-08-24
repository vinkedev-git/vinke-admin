export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminRoute";
import { dateFromUnknown, secondsFromUnknown } from "@/lib/dateValue";

type AssinaturaItem = {
  uid: string;
  aluno: string;
  email: string;
  origem: string;
  plano: string;
  planoOrigem: "catalogo" | "eduzz" | "manual" | "sem-plano";
  status: "ativo" | "pendente" | "inativo";
  validade: string;
  planId: string;
  productId: string;
  productTitle: string;
  invoiceStatus: string;
  amountPaid: number | null;
  validUntilRaw: string;
  sortSeconds: number;
};

function formatDate(value: unknown) {
  const parsed = dateFromUnknown(value);
  if (!parsed) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(parsed);
}

function toDateInput(value: unknown) {
  const parsed = dateFromUnknown(value);
  if (!parsed) return "";
  return parsed.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  try {
    const snap = await adminDb.collection("users").where("role", "==", "student").get();

    const rawRows = await Promise.all(
      snap.docs.map(async (userDoc) => {
        const [profileSnap, entSnap] = await Promise.all([
          adminDb.collection("users").doc(userDoc.id).collection("profile").doc("main").get(),
          adminDb.collection("entitlements").doc(userDoc.id).get(),
        ]);

        const userData = userDoc.data();
        const profile = profileSnap.exists ? profileSnap.data() ?? {} : {};
        const ent = entSnap.exists ? entSnap.data() ?? {} : {};
        const status =
          ent.active === true ? "ativo" : ent.pending === true ? "pendente" : "inativo";
        const validUntilSeconds = secondsFromUnknown(ent.validUntil);
        const planId = String(ent.planId ?? "").trim();
        const productId = String(ent.productId ?? "").trim();
        const productTitle = String(ent.productTitle ?? "").trim();
        const origem = String(ent.source ?? "admin").trim() || "admin";
        const planoOrigem = planId
          ? "catalogo"
          : productTitle || productId
            ? origem === "eduzz"
              ? "eduzz"
              : "manual"
            : "sem-plano";

        return {
          uid: userDoc.id,
          aluno:
            String(profile.name ?? "").trim() || String(userData.name ?? "").trim() || "Aluno sem nome",
          email: String(userData.email ?? ent.email ?? "").trim() || "—",
          origem,
          plano: productTitle || "Sem plano",
          planoOrigem,
          status,
          validade: formatDate(ent.validUntil ?? null),
          planId,
          productId,
          productTitle,
          invoiceStatus: String(ent.invoiceStatus ?? "").trim(),
          amountPaid:
            typeof ent.amountPaid === "number" && Number.isFinite(ent.amountPaid) ? ent.amountPaid : null,
          validUntilRaw: toDateInput(ent.validUntil ?? null),
          sortSeconds:
            validUntilSeconds ||
            secondsFromUnknown(userData.createdAt) ||
            secondsFromUnknown(userData.updatedAt),
        } satisfies AssinaturaItem;
      })
    );

    const items = rawRows
      .sort((a, b) => b.sortSeconds - a.sortSeconds)
      .map((item) => ({
        uid: item.uid,
        aluno: item.aluno,
        email: item.email,
        origem: item.origem,
        plano: item.plano,
        planoOrigem: item.planoOrigem,
        status: item.status,
        validade: item.validade,
        planId: item.planId,
        productId: item.productId,
        productTitle: item.productTitle,
        invoiceStatus: item.invoiceStatus,
        amountPaid: item.amountPaid,
        validUntilRaw: item.validUntilRaw,
      }));

    return NextResponse.json({ ok: true, items }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível carregar as assinaturas.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
