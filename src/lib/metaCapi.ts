import { createHash } from "crypto";

/**
 * Meta Conversions API — envia o evento Purchase pelo servidor quando a Eduzz
 * confirma o pagamento. Independe do Pixel no checkout da Eduzz.
 *
 * Env (Vercel do admin):
 *   META_PIXEL_ID    — mesmo ID do conjunto de dados "Vinke · site"
 *   META_CAPI_TOKEN  — token gerado em Gerenciador de Eventos → Configurações → API de Conversões
 *   META_CAPI_TEST   — (opcional) código de teste da aba "Testar eventos"; remover em produção
 *
 * Nunca lança: falha vira retorno { ok:false } e é registrada pelo chamador.
 */

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export type PurchaseInput = {
  email: string;
  eventId: string; // id da fatura — Meta deduplica com o Pixel do navegador
  value: number | null;
  currency: string;
  contentName: string | null;
  eventTime?: Date;
  firstName?: string | null;
};

export async function sendMetaPurchase(input: PurchaseInput): Promise<{ ok: boolean; status?: number; error?: string }> {
  const pixelId = process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID || "";
  const token = process.env.META_CAPI_TOKEN || "";
  if (!pixelId || !token) return { ok: false, error: "META_PIXEL_ID/META_CAPI_TOKEN ausentes" };

  const email = input.email.trim().toLowerCase();
  const userData: Record<string, unknown> = { em: [sha256(email)] };
  const fn = input.firstName?.trim().toLowerCase();
  if (fn) userData.fn = [sha256(fn)];

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor((input.eventTime ?? new Date()).getTime() / 1000),
        event_id: input.eventId,
        action_source: "website",
        event_source_url: "https://vinke.app.br/",
        user_data: userData,
        custom_data: {
          currency: input.currency || "BRL",
          value: input.value ?? 0,
          content_name: input.contentName ?? undefined,
          content_type: "product",
        },
      },
    ],
  };
  if (process.env.META_CAPI_TEST) body.test_event_code = process.env.META_CAPI_TEST;

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: txt.slice(0, 300) };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
