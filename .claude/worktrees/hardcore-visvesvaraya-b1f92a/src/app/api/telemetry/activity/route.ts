export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

type ActivityClient = "web" | "app";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Client-Platform",
  };
}

function normalizeClient(value: unknown): ActivityClient {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "app" ? "app" : "web";
}

function inferDevice(userAgent: string) {
  const normalized = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(normalized)) return "ios";
  if (/android/.test(normalized)) return "android";
  if (/mobile/.test(normalized)) return "mobile";
  return "desktop";
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401, headers: corsHeaders() }
      );
    }

    const decoded = await adminAuth.verifyIdToken(token);
    const body = await req.json().catch(() => ({}));
    const client = normalizeClient(body.client ?? req.headers.get("x-client-platform"));
    const userAgent = req.headers.get("user-agent") || "";

    await adminDb.collection("user_activity").doc(decoded.uid).set(
      {
        uid: decoded.uid,
        email: decoded.email || null,
        client,
        device: inferDevice(userAgent),
        userAgent: userAgent.slice(0, 500),
        lastSeenAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders() });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: corsHeaders() }
    );
  }
}
