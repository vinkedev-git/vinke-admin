// src/lib/resend.ts
export async function sendResendEmail(params: {
  to: string;
  subject: string;
  html: string;
}) {
  const apiKey = process.env.RESEND_API_KEY || "";
  const from = process.env.RESEND_FROM_EMAIL || "";

  if (!apiKey) throw new Error("Missing RESEND_API_KEY");
  if (!from) throw new Error("Missing RESEND_FROM_EMAIL");

  // A Resend limita a 10 requisições por segundo. O cron de e-mails dispara
  // em lotes e, sem repetição, um 429 virava e-mail perdido: em 04/11/2026
  // foram 52 de uma vez. 429 e 5xx são transitórios — vale reenviar.
  const MAX_TENTATIVAS = 4;

  for (let tentativa = 1; ; tentativa++) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
      }),
    });

    if (res.ok) return;

    const txt = await res.text().catch(() => "");
    const transitorio = res.status === 429 || res.status >= 500;
    if (!transitorio || tentativa >= MAX_TENTATIVAS) {
      throw new Error(`Resend error: ${res.status} ${txt}`);
    }

    // Respeita o Retry-After quando vem; senão, recuo exponencial.
    const retryAfter = Number(res.headers.get("retry-after"));
    const espera = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 5000)
      : Math.min(300 * 2 ** (tentativa - 1), 2400);
    await new Promise((r) => setTimeout(r, espera));
  }
}