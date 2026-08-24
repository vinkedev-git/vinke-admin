export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { buildBlingAuthorizeUrl, resolveBlingRedirectUri } from "@/lib/bling";

const STATE_COOKIE = "bling_oauth_state";

function inferOrigin(req: NextRequest) {
  const origin = req.nextUrl.origin;
  if (origin && origin !== "null") return origin;
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return host ? `${proto}://${host}` : "";
}

export async function GET(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  try {
    const origin = inferOrigin(req);
    if (!origin) {
      return NextResponse.json(
        { ok: false, error: "Não foi possível identificar a origem da aplicação." },
        { status: 400 }
      );
    }

    const state = crypto.randomUUID();
    const authorizeUrl = buildBlingAuthorizeUrl(origin, state);
    const redirectUri = resolveBlingRedirectUri(origin);

    const response = NextResponse.json(
      {
        ok: true,
        authorizeUrl,
        redirectUri,
      },
      { status: 200 }
    );

    response.cookies.set({
      name: STATE_COOKIE,
      value: state,
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 10,
    });

    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Não foi possível iniciar a autorização do Bling.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
