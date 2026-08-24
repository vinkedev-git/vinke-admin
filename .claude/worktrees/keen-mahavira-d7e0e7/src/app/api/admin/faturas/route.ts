export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminRoute";
import { secondsFromUnknown } from "@/lib/dateValue";

function getSeconds(value: unknown) {
  return secondsFromUnknown(value);
}

function formatDate(value: unknown) {
  const seconds = getSeconds(value);
  if (!seconds) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(seconds * 1000));
}

export async function GET(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  try {
    const [billingSnap, usersSnap, entitlementsSnap] = await Promise.all([
      adminDb.collection("billing_records").get(),
      adminDb.collection("users").where("role", "==", "student").get(),
      adminDb.collection("entitlements").get(),
    ]);

    const userMap = new Map<string, { name: string; email: string }>();
    await Promise.all(
      usersSnap.docs.map(async (userDoc) => {
        const profileSnap = await userDoc.ref.collection("profile").doc("main").get();
        userMap.set(userDoc.id, {
          name:
            String(profileSnap.exists ? profileSnap.data()?.name ?? "" : "").trim() ||
            String(userDoc.data().name ?? "").trim() ||
            "Aluno sem nome",
          email: String(userDoc.data().email ?? "").trim() || "—",
        });
      })
    );

    const entMap = new Map<string, Record<string, unknown>>();
    entitlementsSnap.docs.forEach((docSnap) => {
      entMap.set(docSnap.id, docSnap.data() as Record<string, unknown>);
    });

    const rows = billingSnap.docs
      .map((docSnap) => {
        const billing = docSnap.data() as Record<string, unknown>;
        const ent = entMap.get(docSnap.id) ?? {};
        const user = userMap.get(docSnap.id);
        const invoices = Array.isArray(billing.invoices) ? billing.invoices : [];
        const latestInvoice =
          invoices.length > 0
            ? [...invoices].sort(
                (a, b) =>
                  getSeconds((b as Record<string, unknown>).createdAt) -
                  getSeconds((a as Record<string, unknown>).createdAt)
              )[0]
            : null;

        return {
          uid: docSnap.id,
          aluno: user?.name ?? "Aluno sem nome",
          email: user?.email ?? (String(ent.email ?? "").trim() || "—"),
          total:
            typeof (latestInvoice as Record<string, unknown> | null)?.total === "number"
              ? Number((latestInvoice as Record<string, unknown>).total)
              : typeof ent.amountPaid === "number"
                ? Number(ent.amountPaid)
                : null,
          createdAt: formatDate(
            (latestInvoice as Record<string, unknown> | null)?.createdAt ?? billing.updatedAt ?? null
          ),
          status: String(
            (latestInvoice as Record<string, unknown> | null)?.status ?? ent.invoiceStatus ?? "pendente"
          )
            .trim()
            .toLowerCase(),
          productTitle: String(ent.productTitle ?? "").trim() || "Assinatura",
          sortSeconds: getSeconds(
            (latestInvoice as Record<string, unknown> | null)?.createdAt ?? billing.updatedAt ?? null
          ),
        };
      })
      .sort((a, b) => b.sortSeconds - a.sortSeconds)
      .map(({ sortSeconds: _sortSeconds, ...item }) => item);

    return NextResponse.json({ ok: true, items: rows }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar faturas.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
