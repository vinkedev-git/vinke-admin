export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminRoute";

const HEADERS = [
  "docId",
  "prompt_text",
  "imageUrl",
  "optionA_text",
  "optionA_imageUrl",
  "optionB_text",
  "optionB_imageUrl",
  "optionC_text",
  "optionC_imageUrl",
  "optionD_text",
  "optionD_imageUrl",
  "optionE_text",
  "optionE_imageUrl",
  "correctOptionId",
  "shuffleOptions",
  "explanation",
  "reference",
  "themes",
  "prova_tipo",
  "prova_ano",
  "nivel",
  "Prova",
  "isActive",
];

function xmlEscape(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeThemes(data: Record<string, unknown>) {
  if (Array.isArray(data.themes)) {
    return data.themes
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
      .join("; ");
  }

  return String(data.themes ?? "").trim();
}

function buildRow(docId: string, data: Record<string, unknown>) {
  const options = Array.isArray(data.options)
    ? (data.options as Array<Record<string, unknown>>)
    : [];

  const optionMap = {
    A: options.find((option) => String(option.id ?? "").trim().toUpperCase() === "A"),
    B: options.find((option) => String(option.id ?? "").trim().toUpperCase() === "B"),
    C: options.find((option) => String(option.id ?? "").trim().toUpperCase() === "C"),
    D: options.find((option) => String(option.id ?? "").trim().toUpperCase() === "D"),
    E: options.find((option) => String(option.id ?? "").trim().toUpperCase() === "E"),
  };

  return [
    docId,
    data.prompt_text ?? data.prompt ?? "",
    data.imageUrl ?? "",
    data.optionA_text ?? optionMap.A?.text ?? "",
    data.optionA_imageUrl ?? optionMap.A?.imageUrl ?? "",
    data.optionB_text ?? optionMap.B?.text ?? "",
    data.optionB_imageUrl ?? optionMap.B?.imageUrl ?? "",
    data.optionC_text ?? optionMap.C?.text ?? "",
    data.optionC_imageUrl ?? optionMap.C?.imageUrl ?? "",
    data.optionD_text ?? optionMap.D?.text ?? "",
    data.optionD_imageUrl ?? optionMap.D?.imageUrl ?? "",
    data.optionE_text ?? optionMap.E?.text ?? "",
    data.optionE_imageUrl ?? optionMap.E?.imageUrl ?? "",
    data.correctOptionId ?? "",
    data.shuffleOptions === false ? 0 : 1,
    data.explanation ?? "",
    data.reference ?? "",
    normalizeThemes(data),
    data.prova_tipo ?? data.examType ?? "",
    data.prova_ano ?? data.examYear ?? "",
    data.nivel ?? data.level ?? "",
    data.Prova ?? "",
    data.isActive === false ? 0 : 1,
  ].map((value) => String(value ?? ""));
}

function buildSpreadsheetXml(rows: string[][]) {
  const headerRow = HEADERS.map(
    (header) => `<Cell><Data ss:Type="String">${xmlEscape(header)}</Data></Cell>`
  ).join("");

  const bodyRows = rows
    .map((row) => {
      const cells = row
        .map((value) => `<Cell><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`)
        .join("");
      return `<Row>${cells}</Row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Worksheet ss:Name="firebase_import">
    <Table>
      <Row>${headerRow}</Row>
      ${bodyRows}
    </Table>
  </Worksheet>
</Workbook>`;
}

export async function GET(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  try {
    const snap = await adminDb.collection("questionsBank").get();
    const rows = snap.docs
      .map((docSnap) => buildRow(docSnap.id, docSnap.data() as Record<string, unknown>))
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

    const xml = buildSpreadsheetXml(rows);
    const fileName = `questionsBank-export-${new Date().toISOString().slice(0, 10)}.xls`;

    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao exportar questões.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
