export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { runSimuladoRetentionCleanup } from "@/lib/simuladoRetention";

function pickBearerToken(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return "";
  return auth.slice(7).trim();
}

function pickMaintenanceToken(req: NextRequest) {
  return (
    req.headers.get("x-maintenance-key")?.trim() ||
    req.headers.get("x-cleanup-key")?.trim() ||
    pickBearerToken(req) ||
    ""
  );
}

function isAuthorized(req: NextRequest) {
  const received = pickMaintenanceToken(req);
  if (!received) return false;

  const allowedTokens = [
    process.env.SIMULADOS_CLEANUP_SECRET,
    process.env.CRON_SECRET,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  if (!allowedTokens.length) return false;
  return allowedTokens.includes(received);
}

function parseNumber(value: string | null, fallback: number) {
  const n = Number(value ?? "");
  return Number.isFinite(n) ? n : fallback;
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const graceDays = parseNumber(searchParams.get("graceDays"), 30);
  const maxUsers = parseNumber(searchParams.get("maxUsers"), 0);
  const dryRun = searchParams.get("dryRun") !== "0";

  try {
    const summary = await runSimuladoRetentionCleanup({
      graceDays,
      dryRun,
      maxUsers: maxUsers > 0 ? maxUsers : undefined,
    });

    return NextResponse.json({ ok: true, summary }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro na limpeza de simulados.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
