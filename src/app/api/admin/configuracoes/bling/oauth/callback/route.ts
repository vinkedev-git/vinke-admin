export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { exchangeBlingAuthorizationCode, updateBlingSettings } from "@/lib/bling";

const STATE_COOKIE = "bling_oauth_state";

function inferOrigin(req: NextRequest) {
  const origin = req.nextUrl.origin;
  if (origin && origin !== "null") return origin;
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return host ? `${proto}://${host}` : "";
}

function redirectToSettings(req: NextRequest, status: "connected" | "error", message?: string) {
  const url = new URL("/admin/configuracoes", req.nextUrl.origin);
  url.searchParams.set("bling", status);
  if (message) {
    url.searchParams.set("message", message);
  }
  const response = NextResponse.redirect(url);
  response.cookies.set({
    name: STATE_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")?.trim() || "";
  const state = req.nextUrl.searchParams.get("state")?.trim() || "";
  const error = req.nextUrl.searchParams.get("error")?.trim() || "";
  const cookieState = req.cookies.get(STATE_COOKIE)?.value?.trim() || "";

  if (error) {
    return redirectToSettings(req, "error", error);
  }

  if (!code) {
    return redirectToSettings(req, "error", "callback_sem_code");
  }

  if (!state || !cookieState || state !== cookieState) {
    return redirectToSettings(req, "error", "estado_invalido");
  }

  try {
    const origin = inferOrigin(req);
    const tokens = await exchangeBlingAuthorizationCode(code, origin);

    await updateBlingSettings(
      {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
      "oauth_callback"
    );

    return redirectToSettings(req, "connected");
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message.slice(0, 120) : "falha_oauth";
    return redirectToSettings(req, "error", message);
  }
}
