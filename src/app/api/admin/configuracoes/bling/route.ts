export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminRoute";
import { getBlingSettingsSummary, updateBlingSettings } from "@/lib/bling";

function pickString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function pickBoolean(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

export async function GET(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  try {
    const settings = await getBlingSettingsSummary();
    return NextResponse.json({ ok: true, settings }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Não foi possível carregar as configurações.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  try {
    const body = (await req.json()) as Record<string, unknown>;

    await updateBlingSettings(
      {
        enabled: pickBoolean(body.enabled),
        apiBaseUrl: pickString(body.apiBaseUrl),
        contactsEndpointPath: pickString(body.contactsEndpointPath),
        nfseEndpointPath: pickString(body.nfseEndpointPath),
        serviceCode: pickString(body.serviceCode),
        serviceDescription: pickString(body.serviceDescription),
        serviceNature: pickString(body.serviceNature),
        serviceListItem: pickString(body.serviceListItem),
        cnae: pickString(body.cnae),
        series: pickString(body.series),
        issRate: body.issRate,
        defaultComment: pickString(body.defaultComment),
        autoCreateContact: pickBoolean(body.autoCreateContact),
        accessToken: pickString(body.accessToken),
        refreshToken: pickString(body.refreshToken),
      },
      authCheck.adminUid
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Não foi possível salvar as configurações.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
