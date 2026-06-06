// INV-2c / C-6 — bulk product import template (xlsx).
//
// Mirrors lib/client-onboarding-template.ts mechanics: exceljs is dynamic-
// imported in each function so the ~1 MB lib stays out of the main bundle, and
// a hidden workbook.subject version stamp gates uploads (CL-11 pattern). This is
// a tabular grid — header row + one row per product.
//
// C-6: 10 columns (reorder columns dropped — low-stock is set per-part in the
// app, not via import). Headers display app-friendly labels (Part #, …) while
// the parser keeps a positional machine-key contract via COLUMNS. Category /
// manufacturer / unit / vendor / tracking-mode get type-able data-validation
// dropdowns (errorStyle 'warning' — pick OR type). Stamp bumped v1 -> v2.
//
// Warn-and-proceed (CL-10): the parser populates whatever is present and
// returns a warnings[] list; only Part # + name are required.

import type { DbInventoryProductInsert, InventoryTrackingMode } from "@/lib/types/database";

const VERSION_STAMP_VALUE = "nexvelon-inventory-v2";
const SHEET_NAME = "Inventory Products";
const LISTS_SHEET_NAME = "Lists";
export const INVENTORY_TEMPLATE_FILENAME = "Inventory Products Template.xlsx";

// Positional contract shared by generator + parser. `key` is the machine name
// (parser reads by position via this array); `header` is the displayed label.
const COLUMNS: { key: string; header: string }[] = [
  { key: "sku", header: "Part #" },
  { key: "name", header: "Name" },
  { key: "description", header: "Description" },
  { key: "category", header: "Category" },
  { key: "manufacturer", header: "Manufacturer" },
  { key: "vendor", header: "Vendor" },
  { key: "tracking_mode", header: "Tracking mode" },
  { key: "unit_of_measure", header: "Unit of measure" },
  { key: "default_unit_cost", header: "Default unit cost" },
  { key: "list_price", header: "List price" },
];

const TRACKING_MODES = ["serialized", "non_serialized", "bulk"];

export interface InventoryTemplateLists {
  categories?: string[];
  manufacturers?: string[];
  units?: string[];
  vendors?: string[];
}

export interface ParsedInventoryTemplate {
  rows: DbInventoryProductInsert[];
  warnings: string[];
}

// ── helpers ───────────────────────────────────────────────────────────────

function colIndex(key: string): number {
  return COLUMNS.findIndex((c) => c.key === key);
}

function cellToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
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

function columnLetter(index1: number): string {
  // 1-based column index -> A1 letter (sufficient for <= 26 columns here).
  return String.fromCharCode(64 + index1);
}

// ── generate ────────────────────────────────────────────────────────────────

/**
 * Build the import template xlsx and return it as a Blob for download. Live
 * lists (category/manufacturer/unit/vendor) drive the type-able dropdowns; any
 * omitted/empty list simply gets no dropdown for that column (free-text only).
 */
export async function generateInventoryTemplate(
  lists: InventoryTemplateLists = {}
): Promise<Blob> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Nexvelon";
  workbook.subject = VERSION_STAMP_VALUE;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(SHEET_NAME);

  // Header row — bold BLACK text on the house gold fill.
  const header = sheet.getRow(1);
  COLUMNS.forEach((col, i) => {
    const cell = header.getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: "FF000000" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFC9A24B" },
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });
  header.height = 20;

  const widths = [16, 28, 32, 18, 16, 12, 16, 16, 16, 14];
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  // One illustrative example row — black italic so it's readable but clearly a
  // placeholder to overwrite.
  const sample: Record<string, string> = {
    sku: "KT-300",
    name: "Kantech ioSmart Reader",
    description: "Single-door smart reader",
    category: "Access Control",
    manufacturer: "Kantech",
    vendor: "ADI",
    tracking_mode: "serialized",
    unit_of_measure: "Each",
    default_unit_cost: "129.00",
    list_price: "199.00",
  };
  const example = sheet.getRow(2);
  COLUMNS.forEach((col, i) => {
    example.getCell(i + 1).value = sample[col.key] ?? "";
    example.getCell(i + 1).font = {
      italic: true,
      color: { argb: "FF000000" },
    };
  });

  // ── Dropdowns (type-able) via a hidden Lists sheet ──
  // One column per list; data validation references the range so we never hit
  // the ~255-char inline-formula limit. errorStyle 'warning' = pick OR type.
  const listsSheet = workbook.addWorksheet(LISTS_SHEET_NAME);
  listsSheet.state = "veryHidden";

  const dropdowns: { colKey: string; values: string[] }[] = [
    { colKey: "category", values: lists.categories ?? [] },
    { colKey: "manufacturer", values: lists.manufacturers ?? [] },
    { colKey: "vendor", values: lists.vendors ?? [] },
    { colKey: "tracking_mode", values: TRACKING_MODES },
    { colKey: "unit_of_measure", values: lists.units ?? [] },
  ];

  const LAST_VALIDATION_ROW = 1000;
  dropdowns.forEach((d, listColIdx) => {
    if (d.values.length === 0) return; // no dropdown when the list is empty
    const listCol = columnLetter(listColIdx + 1); // A, B, C, … on Lists sheet
    d.values.forEach((v, i) => {
      listsSheet.getCell(`${listCol}${i + 1}`).value = v;
    });
    const targetColIdx = colIndex(d.colKey) + 1;
    const rangeRef = `${LISTS_SHEET_NAME}!$${listCol}$1:$${listCol}$${d.values.length}`;
    // exceljs's typed API sets validation per cell (cell.dataValidation),
    // matching the client-onboarding template. Apply across the data range.
    for (let r = 2; r <= LAST_VALIDATION_ROW; r++) {
      sheet.getRow(r).getCell(targetColIdx).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`=${rangeRef}`],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Not in the list",
        error: "You can keep this value or pick one from the dropdown.",
      };
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ── parse ─────────────────────────────────────────────────────────────────

/**
 * Parse a filled import template. Warn-and-proceed: returns every valid row
 * plus a warnings[] list. Part # + name are required (missing → row skipped);
 * tracking_mode accepts serialized / non_serialized / bulk (unknown → defaults
 * to serialized with a warning); numeric columns parse to number | null. The
 * untouched example row (Part # "KT-300" + name "Kantech ioSmart Reader") is
 * skipped silently.
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

  // v2 stamp gate — v1 (and foreign) files are rejected with a friendly message.
  const subject = workbook.subject ?? "";
  if (!subject.includes(VERSION_STAMP_VALUE)) {
    throw new Error(
      "This template is from an older or unrecognized version. Please download the latest template using 'Download template'."
    );
  }

  const rows: DbInventoryProductInsert[] = [];
  const warnings: string[] = [];

  const lastRow = sheet.rowCount;
  for (let r = 2; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    const get = (key: string) => row.getCell(colIndex(key) + 1).value;

    const sku = cellToString(get("sku"));
    const name = cellToString(get("name"));

    // Skip the untouched example row silently.
    if (sku === "KT-300" && name === "Kantech ioSmart Reader") continue;

    // Fully-empty row → skip silently.
    if (sku === "" && name === "") continue;

    if (sku === "" || name === "") {
      warnings.push(
        `Row ${r}: skipped — ${sku === "" ? "missing Part #" : "missing name"}.`
      );
      continue;
    }

    // tracking_mode: accept serialized / non_serialized / bulk.
    const rawMode = cellToString(get("tracking_mode")).toLowerCase();
    let tracking_mode: InventoryTrackingMode = "serialized";
    if (
      rawMode === "serialized" ||
      rawMode === "non_serialized" ||
      rawMode === "bulk"
    ) {
      tracking_mode = rawMode;
    } else if (rawMode !== "") {
      warnings.push(
        `Row ${r} (${sku}): tracking mode "${rawMode}" not recognized — defaulted to serialized.`
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
    });
  }

  return { rows, warnings };
}
