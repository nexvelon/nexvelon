// INV-2c — bulk product import template (xlsx).
//
// Mirrors lib/client-onboarding-template.ts mechanics: exceljs is dynamic-
// imported in each function so the ~1 MB lib stays out of the main bundle, and
// a hidden workbook.subject version stamp gates uploads (CL-11 pattern). Unlike
// the client template (a label-value form), this is a simple tabular grid —
// header row + one row per product — because import is many-rows-at-once.
//
// Warn-and-proceed (CL-10): the parser populates whatever is present and
// returns a warnings[] list; only sku + name are required (rows missing either
// are skipped). No stock units here — catalog products only (receiving = INV-2d).

import type { DbInventoryProductInsert, InventoryTrackingMode } from "@/lib/types/database";

const VERSION_STAMP_VALUE = "nexvelon-inventory-v1";
const SHEET_NAME = "Inventory Products";
export const INVENTORY_TEMPLATE_FILENAME = "Inventory Products Template.xlsx";

// Column order = header text. Index in this array == 0-based column offset.
const COLUMNS = [
  "sku",
  "name",
  "description",
  "category",
  "manufacturer",
  "vendor",
  "tracking_mode",
  "unit_of_measure",
  "default_unit_cost",
  "list_price",
  "reorder_point",
  "reorder_qty",
] as const;

export interface ParsedInventoryTemplate {
  rows: DbInventoryProductInsert[];
  warnings: string[];
}

// ── helpers ───────────────────────────────────────────────────────────────

function cellToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    // exceljs rich-text / hyperlink / formula cells expose `.text` or `.result`.
    const obj = value as { text?: unknown; result?: unknown };
    if (typeof obj.text === "string") return obj.text.trim();
    if (obj.result != null) return String(obj.result).trim();
  }
  return String(value).trim();
}

function numOrNull(value: unknown): number | null {
  const s = cellToString(value);
  if (s === "") return null;
  const n = Number(s.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// ── generate ────────────────────────────────────────────────────────────────

/** Build the import template xlsx and return it as a Blob for download. */
export async function generateInventoryTemplate(): Promise<Blob> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Nexvelon";
  // CL-11 pattern: hidden version stamp in <dc:subject>. parseInventoryTemplate
  // gates uploads on this string; foreign / older files fail the gate.
  workbook.subject = VERSION_STAMP_VALUE;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(SHEET_NAME);

  // Header row — bold, gold fill to match the house template style.
  const header = sheet.getRow(1);
  COLUMNS.forEach((col, i) => {
    const cell = header.getCell(i + 1);
    cell.value = col;
    cell.font = { bold: true, color: { argb: "FF000000" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFC9A24B" },
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });
  header.height = 20;

  // Sensible column widths.
  const widths = [16, 28, 32, 18, 16, 12, 16, 16, 16, 14, 14, 14];
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  // One illustrative example row so the operator sees the expected shape.
  const example = sheet.getRow(2);
  const sample = [
    "KT-300",
    "Kantech ioSmart Reader",
    "Single-door smart reader",
    "Access Control",
    "Kantech",
    "ADI",
    "serialized",
    "each",
    "129.00",
    "199.00",
    "10",
    "25",
  ];
  sample.forEach((v, i) => {
    example.getCell(i + 1).value = v;
    example.getCell(i + 1).font = { italic: true, color: { argb: "FF9CA3AF" } };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ── parse ─────────────────────────────────────────────────────────────────

/**
 * Parse a filled import template. Warn-and-proceed: returns every valid row
 * plus a warnings[] list. sku + name are required (missing → row skipped with
 * a warning); tracking_mode is coerced to 'serialized' when blank/invalid;
 * numeric columns parse to number | null. The example row (italic placeholder)
 * is detectable only by content, so operators are told to overwrite it — a row
 * with sku "KT-300" + name "Kantech ioSmart Reader" verbatim is treated as the
 * untouched sample and skipped silently.
 */
export async function parseInventoryTemplate(
  file: File
): Promise<ParsedInventoryTemplate> {
  const ExcelJS = await import("exceljs");
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) {
    throw new Error(
      "This file doesn't look like an inventory import template. Download a fresh template using 'Download template'."
    );
  }

  // CL-11 version-stamp gate.
  const subject = workbook.subject ?? "";
  if (!subject.includes(VERSION_STAMP_VALUE)) {
    throw new Error(
      "This template appears to be from an older or unrecognized version. Download a fresh template using 'Download template'."
    );
  }

  const rows: DbInventoryProductInsert[] = [];
  const warnings: string[] = [];

  // Data starts at row 2 (row 1 = header).
  const lastRow = sheet.rowCount;
  for (let r = 2; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    const get = (colName: (typeof COLUMNS)[number]) =>
      row.getCell(COLUMNS.indexOf(colName) + 1).value;

    const sku = cellToString(get("sku"));
    const name = cellToString(get("name"));

    // Skip the untouched example row silently.
    if (sku === "KT-300" && name === "Kantech ioSmart Reader") continue;

    // Fully-empty row → skip silently.
    if (sku === "" && name === "") continue;

    if (sku === "" || name === "") {
      warnings.push(
        `Row ${r}: skipped — ${sku === "" ? "missing SKU" : "missing name"}.`
      );
      continue;
    }

    // tracking_mode coercion (warn-and-proceed).
    const rawMode = cellToString(get("tracking_mode")).toLowerCase();
    let tracking_mode: InventoryTrackingMode = "serialized";
    if (rawMode === "bulk") {
      tracking_mode = "bulk";
    } else if (rawMode !== "" && rawMode !== "serialized") {
      warnings.push(
        `Row ${r} (${sku}): tracking_mode "${rawMode}" not recognized — defaulted to serialized.`
      );
    }

    const uom = cellToString(get("unit_of_measure"));

    rows.push({
      sku,
      name,
      description: cellToString(get("description")) || null,
      category: cellToString(get("category")) || null,
      manufacturer: cellToString(get("manufacturer")) || null,
      vendor: cellToString(get("vendor")) || null,
      tracking_mode,
      unit_of_measure: uom || "each",
      default_unit_cost: numOrNull(get("default_unit_cost")),
      list_price: numOrNull(get("list_price")),
      reorder_point: numOrNull(get("reorder_point")),
      reorder_qty: numOrNull(get("reorder_qty")),
    });
  }

  return { rows, warnings };
}
