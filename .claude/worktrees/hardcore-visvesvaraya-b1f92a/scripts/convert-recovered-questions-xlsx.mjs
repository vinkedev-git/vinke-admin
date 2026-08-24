import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const DEFAULT_SHEET = "Questões";
const IMPORT_HEADERS = [
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
  "internalNote",
];

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveArg(flag, fallback = "") {
  const entry = process.argv.slice(2).find((item) => item.startsWith(`${flag}=`));
  return entry ? entry.slice(flag.length + 1) : fallback;
}

function resolveFilePath(inputPath) {
  const raw = normalizeText(inputPath);
  if (!raw) {
    throw new Error("Informe a planilha com --file=/caminho/para/arquivo.xlsx");
  }

  const filePath = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }
  return filePath;
}

function parseWorkbookRows(filePath, sheetName = DEFAULT_SHEET) {
  const tempOutput = path.join(
    os.tmpdir(),
    `questoes-recovered-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  const py = `
import json
import sys
import zipfile
from xml.etree import ElementTree as ET

path = sys.argv[1]
sheet_name = sys.argv[2]
out_path = sys.argv[3]
ns = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}

def cell_value(cell, shared_strings):
    cell_type = cell.attrib.get("t")
    if cell_type == "s":
        v = cell.find("a:v", ns)
        if v is None or v.text is None:
            return ""
        return shared_strings[int(v.text)]
    if cell_type == "inlineStr":
        return "".join(t.text or "" for t in cell.findall(".//a:t", ns))
    v = cell.find("a:v", ns)
    if v is not None and v.text is not None:
        return v.text
    return "".join(t.text or "" for t in cell.findall(".//a:t", ns))

with zipfile.ZipFile(path) as zf:
    shared_strings = []
    if "xl/sharedStrings.xml" in zf.namelist():
        root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
        for si in root.findall("a:si", ns):
            shared_strings.append("".join(t.text or "" for t in si.findall(".//a:t", ns)))

    workbook = ET.fromstring(zf.read("xl/workbook.xml"))
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    rid_to_target = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}

    sheet_target = None
    for sheet in workbook.findall("a:sheets/a:sheet", ns):
        if sheet.attrib.get("name") == sheet_name:
            rid = sheet.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
            sheet_target = "xl/" + rid_to_target[rid]
            break

    if sheet_target is None:
        raise SystemExit(f"Aba não encontrada: {sheet_name}")

    root = ET.fromstring(zf.read(sheet_target))
    rows = []
    for row in root.findall(".//a:sheetData/a:row", ns):
        data = {}
        for cell in row.findall("a:c", ns):
            ref = cell.attrib.get("r", "")
            col = "".join(ch for ch in ref if ch.isalpha())
            data[col] = cell_value(cell, shared_strings)
        rows.append(data)

if not rows:
    with open(out_path, "w", encoding="utf-8") as fp:
        json.dump([], fp, ensure_ascii=False)
    raise SystemExit(0)

header_row = rows[0]
mapped = []
for row in rows[1:]:
    record = {}
    for key, value in row.items():
        header = header_row.get(key, key)
        record[header] = value
    if any((str(v).strip() if v is not None else "") for v in record.values()):
        mapped.append(record)

with open(out_path, "w", encoding="utf-8") as fp:
    json.dump(mapped, fp, ensure_ascii=False)
`;

  try {
    execFileSync("python3", ["-c", py, filePath, sheetName, tempOutput], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(fs.readFileSync(tempOutput, "utf8"));
  } finally {
    if (fs.existsSync(tempOutput)) {
      fs.unlinkSync(tempOutput);
    }
  }
}

function splitIncorrectOptions(value) {
  return normalizeText(value)
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function deriveExamMetadata(title) {
  const match = normalizeText(title).match(/^\(([^)]+)\)/);
  if (!match) {
    return { prova_tipo: "", prova_ano: "", Prova: "" };
  }

  const raw = match[1].trim();
  const proofLabel = `(${raw})`;

  const yearMatch = raw.match(/^(TSA|TEA)-(\d{4})$/i);
  if (yearMatch) {
    return {
      prova_tipo: yearMatch[1].toUpperCase(),
      prova_ano: yearMatch[2],
      Prova: proofLabel,
    };
  }

  const meMatch = raw.match(/^ME\d+$/i);
  if (meMatch) {
    return {
      prova_tipo: "ME",
      prova_ano: "",
      Prova: proofLabel,
    };
  }

  return { prova_tipo: "", prova_ano: "", Prova: proofLabel };
}

function toImportRow(source) {
  const prompt = normalizeText(source["Título"]);
  const correct = normalizeText(source["Alternativas (Corretas)"]);
  const incorrect = splitIncorrectOptions(source["Alternativas (Incorretas)"]);
  const metadata = deriveExamMetadata(prompt);
  const status = normalizeText(source.Status).toLowerCase();

  return {
    docId: normalizeText(source.UUID) || normalizeText(source.ID),
    prompt_text: prompt,
    imageUrl: "",
    optionA_text: correct,
    optionA_imageUrl: "",
    optionB_text: incorrect[0] ?? "",
    optionB_imageUrl: "",
    optionC_text: incorrect[1] ?? "",
    optionC_imageUrl: "",
    optionD_text: incorrect[2] ?? "",
    optionD_imageUrl: "",
    correctOptionId: "A",
    shuffleOptions: "1",
    explanation: normalizeText(source.Notas),
    reference: normalizeText(source.Referência),
    themes: "",
    prova_tipo: metadata.prova_tipo,
    prova_ano: metadata.prova_ano,
    nivel: "",
    Prova: metadata.Prova,
    isActive: status === "inactive" ? "0" : "1",
    internalNote: normalizeText(source.Observação),
  };
}

function classifyRows(rows) {
  const valid = [];
  const review = [];

  for (const row of rows) {
    const correct = normalizeText(row["Alternativas (Corretas)"]);
    const incorrect = splitIncorrectOptions(row["Alternativas (Incorretas)"]);
    const totalOptions = (correct ? 1 : 0) + incorrect.length;

    if (!correct) {
      review.push({
        motivo: "Sem alternativa correta.",
        totalAlternativas: String(totalOptions),
        ...row,
      });
      continue;
    }

    if (incorrect.length !== 3) {
      review.push({
        motivo: `Quantidade incompatível de incorretas (${incorrect.length}).`,
        totalAlternativas: String(totalOptions),
        ...row,
      });
      continue;
    }

    valid.push(toImportRow(row));
  }

  return { valid, review };
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function cellXml(value) {
  return `<Cell><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`;
}

function worksheetXml(name, headers, rows) {
  const headerRow = `<Row>${headers.map((header) => cellXml(header)).join("")}</Row>`;
  const body = rows
    .map((row) => {
      const ordered = headers.map((header) => cellXml(row[header] ?? ""));
      return `<Row>${ordered.join("")}</Row>`;
    })
    .join("");

  return `
    <Worksheet ss:Name="${xmlEscape(name)}">
      <Table>
        ${headerRow}
        ${body}
      </Table>
    </Worksheet>
  `;
}

function buildWorkbook(validRows, reviewRows) {
  const reviewHeaders = [
    "motivo",
    "totalAlternativas",
    "ID",
    "UUID",
    "Título",
    "Referência",
    "Observação",
    "Notas",
    "Alternativas (Corretas)",
    "Alternativas (Incorretas)",
    "Status",
    "Tipo",
    "Taxonomias",
    "Criado em",
    "Atualizado em",
  ];

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Bottom"/>
      <Borders/>
      <Font/>
      <Interior/>
      <NumberFormat/>
      <Protection/>
    </Style>
  </Styles>
  ${worksheetXml("firebase_import", IMPORT_HEADERS, validRows)}
  ${worksheetXml("revisar_manual", reviewHeaders, reviewRows)}
</Workbook>`;

  return xml;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function main() {
  const filePath = resolveFilePath(resolveArg("--file"));
  const outArg = resolveArg("--out");
  const rows = parseWorkbookRows(filePath, DEFAULT_SHEET);
  const { valid, review } = classifyRows(rows);

  const outputDir = outArg
    ? path.dirname(path.isAbsolute(outArg) ? outArg : path.resolve(process.cwd(), outArg))
    : path.resolve(process.cwd(), "exports");
  ensureDir(outputDir);

  const timestamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const outPath = outArg
    ? path.isAbsolute(outArg)
      ? outArg
      : path.resolve(process.cwd(), outArg)
    : path.join(outputDir, `questoes_convertidas_import_${timestamp}.xls`);

  fs.writeFileSync(outPath, buildWorkbook(valid, review), "utf8");

  console.log(
    JSON.stringify(
      {
        output: outPath,
        total: rows.length,
        valid: valid.length,
        review: review.length,
      },
      null,
      2,
    ),
  );
}

main();
