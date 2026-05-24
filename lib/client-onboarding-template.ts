"use client";

import type { Cell, Worksheet } from "exceljs";
import { PROVINCE_CODES } from "./canada-provinces";

// CL-8 — single-sheet client onboarding Excel template.
// Replaces the CL-4 4-sheet layout (Instructions / Client+Billing / Contacts /
// Site) with one polished sheet "Client Onboarding" covering every field on
// ClientFormDrawer + the CL-7 contact type columns (AP, Custom). exceljs is
// dynamic-imported in each function so the ~1 MB library stays out of the
// main bundle. `import type` above is erased at compile.

// ─── Public types ──────────────────────────────────────────────────────────

export interface ParsedContact {
  first_name: string;
  last_name: string;
  role: string; // maps to DbContact.title
  email: string;
  phone: string; // single value; wrapped to phones[{label:"Phone", number}]
  is_primary: boolean;
  is_billing: boolean;
  is_emergency: boolean;
  is_accounts_payable: boolean;
  contact_type_custom: string;
}

export interface ParsedClientTemplate {
  client: {
    legal_name: string;
    name: string; // trade name
    status: string; // "Active" | "Inactive" | "Prospect" — validated in handler
    industry: string;
    hst_gst_number: string;
    tax_exempt: boolean | null; // null = cell empty (don't override existing)
    tax_exempt_cert: string;
  };
  billing: {
    street: string;
    unit: string;
    city: string;
    province: string;
    postal: string;
    country: string;
  };
  mailing: {
    street: string;
    unit: string;
    city: string;
    province: string;
    postal: string;
    country: string;
  };
  payment: {
    terms: string; // enum-style value: "net_30" | "due_on_receipt" | "custom" | ""
    terms_custom: string;
    method: string; // enum-style value: "eft" | "cheque" | "credit_card" | "e_transfer" | "wire" | ""
    credit_limit: string; // raw string — handler parses
    currency: string; // "CAD" | "USD" | ""
  };
  portal: {
    enabled: boolean | null;
    email: string;
  };
  notes: string;
  contacts: ParsedContact[]; // 0..5 from template
}

// ─── Style constants ───────────────────────────────────────────────────────

const SECTION_HEADER_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8C547" },
} as const;
const LABEL_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF5F5F5" },
} as const;
const VALUE_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFF9E6" },
} as const;
const CONTACTS_HEADER_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE5E5E5" },
} as const;
const VALUE_BORDER = {
  top: { style: "thin", color: { argb: "FFCCCCCC" } },
  left: { style: "thin", color: { argb: "FFCCCCCC" } },
  bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
  right: { style: "thin", color: { argb: "FFCCCCCC" } },
} as const;

const STATUS_OPTIONS = ["Prospect", "Active", "Inactive"];
// PROVINCE_OPTIONS — lifted to lib/canada-provinces.ts (SITES-2b).
// PROVINCE_CODES is a `readonly ProvinceCode[]` which the exceljs
// `formulae` API accepts wherever a string[] was accepted before.
const PROVINCE_OPTIONS: readonly string[] = PROVINCE_CODES;
const YES_NO_OPTIONS = ["Yes", "No"];
const PAYMENT_TERMS_LABELS = [
  "Due on receipt",
  "NET 7",
  "NET 15",
  "NET 30",
  "NET 60",
  "NET 90",
  "Custom",
];
const PAYMENT_METHOD_LABELS = [
  "Cheque",
  "EFT",
  "Credit Card",
  "E-Transfer",
  "Wire",
];
const CURRENCY_OPTIONS = ["CAD", "USD"];

// Label → enum value maps (used by parser to round-trip dropdown selections
// back to DB enum strings).
const PAYMENT_TERMS_LABEL_TO_VALUE: Record<string, string> = {
  "due on receipt": "due_on_receipt",
  "net 7": "net_7",
  "net 15": "net_15",
  "net 30": "net_30",
  "net 60": "net_60",
  "net 90": "net_90",
  custom: "custom",
};
const PAYMENT_METHOD_LABEL_TO_VALUE: Record<string, string> = {
  cheque: "cheque",
  eft: "eft",
  "credit card": "credit_card",
  "e-transfer": "e_transfer",
  wire: "wire",
};

// ─── Generator helpers ─────────────────────────────────────────────────────

function sectionHeader(sheet: Worksheet, rowNum: number, title: string) {
  const row = sheet.getRow(rowNum);
  row.getCell(1).value = title;
  row.getCell(1).font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
  row.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  sheet.mergeCells(rowNum, 1, rowNum, 2);
  // Fill the merged range
  for (let c = 1; c <= 2; c++) {
    row.getCell(c).fill = SECTION_HEADER_FILL;
  }
  row.height = 22;
}

function sectionHeaderWide(sheet: Worksheet, rowNum: number, title: string) {
  // Spans cols A–L for the wider Contacts + Notes sections.
  const row = sheet.getRow(rowNum);
  row.getCell(1).value = title;
  row.getCell(1).font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
  row.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  sheet.mergeCells(rowNum, 1, rowNum, 12);
  for (let c = 1; c <= 12; c++) {
    row.getCell(c).fill = SECTION_HEADER_FILL;
  }
  row.height = 22;
}

function labelValueRow(
  sheet: Worksheet,
  rowNum: number,
  label: string,
  options: {
    required?: boolean;
    defaultValue?: string;
    dropdown?: readonly string[];
  } = {}
) {
  const row = sheet.getRow(rowNum);
  row.getCell(1).value = label + (options.required ? " *" : "");
  row.getCell(1).font = { bold: true };
  row.getCell(1).fill = LABEL_FILL;
  row.getCell(1).alignment = { vertical: "middle" };
  row.getCell(2).value = options.defaultValue ?? "";
  row.getCell(2).fill = VALUE_FILL;
  row.getCell(2).border = VALUE_BORDER;
  row.getCell(2).alignment = { vertical: "middle", wrapText: true };
  if (options.dropdown) {
    row.getCell(2).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${options.dropdown.join(",")}"`],
      showErrorMessage: false, // permissive — let the parser handle anything
    };
  }
  row.height = 18;
}

function noteRow(
  sheet: Worksheet,
  rowNum: number,
  text: string,
  mergeToCol = 2
) {
  const row = sheet.getRow(rowNum);
  row.getCell(1).value = text;
  row.getCell(1).font = {
    italic: true,
    color: { argb: "FF666666" },
    size: 10,
  };
  sheet.mergeCells(rowNum, 1, rowNum, mergeToCol);
}

// ─── Generator ─────────────────────────────────────────────────────────────

/**
 * CL-8: generate the single-sheet onboarding Excel template.
 * Returns a Blob downloadable via URL.createObjectURL.
 */
export async function generateClientTemplate(): Promise<Blob> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Nexvelon";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Client Onboarding");

  // Column widths — A=labels, B=values; C–J = contacts table.
  sheet.getColumn(1).width = 22;
  sheet.getColumn(2).width = 40;
  sheet.getColumn(3).width = 20; // Role
  sheet.getColumn(4).width = 28; // Email
  sheet.getColumn(5).width = 18; // Phone
  sheet.getColumn(6).width = 10; // Primary
  sheet.getColumn(7).width = 10; // Billing
  sheet.getColumn(8).width = 12; // Emergency
  sheet.getColumn(9).width = 8; // AP
  sheet.getColumn(10).width = 22; // Custom Type
  sheet.getColumn(11).width = 10;
  sheet.getColumn(12).width = 10;

  // Freeze the title + intro rows so they stay visible while scrolling.
  sheet.views = [{ state: "frozen", ySplit: 3 }];

  // ─── Title block (rows 1–3) ───
  sheet.getCell("A1").value = "Nexvelon Client Onboarding Template";
  sheet.getCell("A1").font = { bold: true, size: 16 };
  sheet.mergeCells("A1:L1");
  sheet.getRow(1).height = 26;

  sheet.getCell("A2").value =
    "Complete the fields below — required fields marked with *";
  sheet.getCell("A2").font = {
    italic: true,
    color: { argb: "FF666666" },
    size: 11,
  };
  sheet.mergeCells("A2:L2");

  sheet.getCell("A3").value =
    "Download a fresh template before each onboarding · Leave fields blank when unknown";
  sheet.getCell("A3").font = { color: { argb: "FF666666" }, size: 10 };
  sheet.mergeCells("A3:L3");

  // Row 4 — spacer.

  // ─── Client Information (rows 5–10) ───
  sectionHeader(sheet, 5, "CLIENT INFORMATION");
  labelValueRow(sheet, 6, "Legal Name", { required: true });
  labelValueRow(sheet, 7, "Trade / Display Name");
  labelValueRow(sheet, 8, "Status", {
    defaultValue: "Prospect",
    dropdown: STATUS_OPTIONS,
  });
  labelValueRow(sheet, 9, "Industry");
  // Row 10 spacer left intentionally — keeps a breath before the next header.

  // ─── Billing Address (rows 12–18) ───
  sectionHeader(sheet, 12, "BILLING ADDRESS");
  labelValueRow(sheet, 13, "Street");
  labelValueRow(sheet, 14, "Unit / Suite");
  labelValueRow(sheet, 15, "City");
  labelValueRow(sheet, 16, "Province", {
    defaultValue: "ON",
    dropdown: PROVINCE_OPTIONS,
  });
  labelValueRow(sheet, 17, "Postal Code");
  labelValueRow(sheet, 18, "Country", { defaultValue: "Canada" });

  // ─── Mailing Address (rows 20–27) ───
  sectionHeader(sheet, 20, "MAILING ADDRESS");
  noteRow(sheet, 21, "Leave all fields blank to use billing address");
  labelValueRow(sheet, 22, "Street");
  labelValueRow(sheet, 23, "Unit / Suite");
  labelValueRow(sheet, 24, "City");
  labelValueRow(sheet, 25, "Province", { dropdown: PROVINCE_OPTIONS });
  labelValueRow(sheet, 26, "Postal Code");
  labelValueRow(sheet, 27, "Country");

  // ─── Tax (rows 29–32) ───
  sectionHeader(sheet, 29, "TAX");
  labelValueRow(sheet, 30, "HST / GST Number");
  labelValueRow(sheet, 31, "Tax Exempt?", { dropdown: YES_NO_OPTIONS });
  labelValueRow(sheet, 32, "Tax Exempt Certificate Number");

  // ─── Payment Terms & Method (rows 34–39) ───
  sectionHeader(sheet, 34, "PAYMENT TERMS & METHOD");
  labelValueRow(sheet, 35, "Payment Terms", {
    defaultValue: "NET 30",
    dropdown: PAYMENT_TERMS_LABELS,
  });
  labelValueRow(sheet, 36, "Custom Terms (if Payment Terms = Custom)");
  labelValueRow(sheet, 37, "Preferred Payment Method", {
    defaultValue: "EFT",
    dropdown: PAYMENT_METHOD_LABELS,
  });
  labelValueRow(sheet, 38, "Credit Limit (CAD)");
  labelValueRow(sheet, 39, "Currency", {
    defaultValue: "CAD",
    dropdown: CURRENCY_OPTIONS,
  });

  // ─── Portal Access (rows 41–43) ───
  sectionHeader(sheet, 41, "PORTAL ACCESS");
  labelValueRow(sheet, 42, "Portal Access Enabled?", {
    defaultValue: "No",
    dropdown: YES_NO_OPTIONS,
  });
  labelValueRow(sheet, 43, "Portal Contact Email");

  // ─── Notes (rows 45–50) ───
  // Section header wide so the merged free-text area aligns visually with
  // the contacts section below.
  sectionHeaderWide(sheet, 45, "NOTES");
  sheet.mergeCells("A46:L50");
  const notesCell = sheet.getCell("A46");
  notesCell.value = "";
  notesCell.fill = LABEL_FILL;
  notesCell.alignment = { vertical: "top", wrapText: true };
  notesCell.border = VALUE_BORDER;

  // ─── Contacts (rows 52–59) ───
  sectionHeaderWide(sheet, 52, "CONTACTS");
  noteRow(
    sheet,
    53,
    "Up to 5 contacts. First Name + Last Name required if filled. Type columns: Yes / X / 1 = checked. Custom Type = free-text label.",
    12
  );

  const contactsHeaders = [
    "First Name *",
    "Last Name *",
    "Role",
    "Email",
    "Phone",
    "Primary",
    "Billing",
    "Emergency",
    "AP",
    "Custom Type",
  ];
  const headerRow = sheet.getRow(54);
  contactsHeaders.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = CONTACTS_HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = VALUE_BORDER;
  });
  headerRow.height = 20;

  // 5 blank data rows (55–59).
  for (let r = 55; r <= 59; r++) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= 10; c++) {
      const cell = row.getCell(c);
      cell.fill = VALUE_FILL;
      cell.border = VALUE_BORDER;
      cell.alignment = {
        vertical: "middle",
        horizontal: c >= 6 && c <= 9 ? "center" : "left",
      };
    }
    // Yes/No dropdowns on the four boolean columns (F=6 through I=9).
    for (let c = 6; c <= 9; c++) {
      row.getCell(c).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`"${YES_NO_OPTIONS.join(",")}"`],
        showErrorMessage: false,
      };
    }
    row.height = 18;
  }

  // ─── Output ───
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ─── Parser helpers ────────────────────────────────────────────────────────

/** Normalize a label for matching: lowercase, trim, strip trailing asterisks. */
function normalizeLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\*/g, "").trim();
}

/**
 * Find a value in a 2-column label/value sheet by matching the label in
 * col 1. Returns the trimmed string from col 2, or "" if not found.
 * Label-based lookup survives clients adding blank rows or reordering rows.
 */
function findValueByLabel(sheet: Worksheet, label: string): string {
  const target = normalizeLabel(label);
  let result = "";
  sheet.eachRow((row) => {
    const cellLabel = row.getCell(1).value?.toString() ?? "";
    if (normalizeLabel(cellLabel) === target) {
      const v = row.getCell(2).value;
      result = v == null ? "" : String(v);
    }
  });
  return result.trim();
}

/**
 * Find the value of col 1 of the row IMMEDIATELY AFTER the row whose col 1
 * matches `headerText` (case-insensitive). Used for the merged Notes block
 * where the value lives in A46 just below the "NOTES" header at row 45.
 */
function findValueAfterHeader(sheet: Worksheet, headerText: string): string {
  const target = headerText.trim().toLowerCase();
  let foundRowNum: number | null = null;
  sheet.eachRow((row, rowNum) => {
    const cellText = row.getCell(1).value?.toString().trim().toLowerCase();
    if (cellText === target && foundRowNum === null) {
      foundRowNum = rowNum;
    }
  });
  if (foundRowNum == null) return "";
  const v = sheet.getRow(foundRowNum + 1).getCell(1).value;
  return v == null ? "" : String(v).trim();
}

/** Parse a yes/no cell into a boolean, or null when the cell is empty. */
function parseBooleanCell(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  return v === "yes" || v === "true" || v === "y" || v === "1" || v === "x";
}

/** Strict variant — empty → false (not null). Used for per-contact flags. */
function parseBooleanCellStrict(raw: string): boolean {
  return parseBooleanCell(raw) === true;
}

function cellToString(cell: Cell): string {
  const v = cell.value;
  return v == null ? "" : String(v).trim();
}

/**
 * Scan the Contacts table: find the header row (col 1 = "First Name"), then
 * iterate data rows below. A row is included if either First or Last name has
 * content. Iteration stops at the first row with BOTH first AND last name
 * empty (partial-fill allowed earlier — later blanks just end the scan).
 */
function scanContactsTable(sheet: Worksheet): ParsedContact[] {
  let headerRowNum: number | null = null;
  sheet.eachRow((row, rowNum) => {
    if (headerRowNum !== null) return;
    const c1 = row.getCell(1).value?.toString();
    if (c1 && normalizeLabel(c1) === "first name") {
      headerRowNum = rowNum;
    }
  });
  if (headerRowNum == null) return [];

  const contacts: ParsedContact[] = [];
  // Cap the scan at 50 rows past the header — generous but bounded.
  for (let r = headerRowNum + 1; r <= headerRowNum + 50; r++) {
    const row = sheet.getRow(r);
    const firstName = cellToString(row.getCell(1));
    const lastName = cellToString(row.getCell(2));
    if (!firstName && !lastName) break;
    contacts.push({
      first_name: firstName,
      last_name: lastName,
      role: cellToString(row.getCell(3)),
      email: cellToString(row.getCell(4)),
      phone: cellToString(row.getCell(5)),
      is_primary: parseBooleanCellStrict(cellToString(row.getCell(6))),
      is_billing: parseBooleanCellStrict(cellToString(row.getCell(7))),
      is_emergency: parseBooleanCellStrict(cellToString(row.getCell(8))),
      is_accounts_payable: parseBooleanCellStrict(cellToString(row.getCell(9))),
      contact_type_custom: cellToString(row.getCell(10)),
    });
  }
  return contacts;
}

/** Map a payment-terms dropdown label back to the DB enum string. */
function mapPaymentTermsLabel(raw: string): string {
  return PAYMENT_TERMS_LABEL_TO_VALUE[raw.trim().toLowerCase()] ?? "";
}

/** Map a payment-method dropdown label back to the DB enum string. */
function mapPaymentMethodLabel(raw: string): string {
  return PAYMENT_METHOD_LABEL_TO_VALUE[raw.trim().toLowerCase()] ?? "";
}

// ─── Parser ────────────────────────────────────────────────────────────────

/**
 * Parse a filled CL-8 template back into structured data. Lenient by design —
 * unknown / blank values pass through as empty strings or null; the form's
 * own validation catches issues on submit.
 *
 * Older (CL-4 / 4-sheet) templates fail the sheet-name check below and the
 * user gets a friendly "download a fresh template" message.
 */
export async function parseClientTemplate(
  file: File
): Promise<ParsedClientTemplate> {
  const ExcelJS = await import("exceljs");
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.getWorksheet("Client Onboarding");
  if (!sheet) {
    throw new Error(
      "This template appears to be from an older version. Please download a fresh template using the 'Download Template' button."
    );
  }

  const taxExemptRaw = findValueByLabel(sheet, "Tax Exempt?");
  const portalEnabledRaw = findValueByLabel(sheet, "Portal Access Enabled?");

  return {
    client: {
      legal_name: findValueByLabel(sheet, "Legal Name"),
      name: findValueByLabel(sheet, "Trade / Display Name"),
      status: findValueByLabel(sheet, "Status"),
      industry: findValueByLabel(sheet, "Industry"),
      hst_gst_number: findValueByLabel(sheet, "HST / GST Number"),
      tax_exempt: parseBooleanCell(taxExemptRaw),
      tax_exempt_cert: findValueByLabel(
        sheet,
        "Tax Exempt Certificate Number"
      ),
    },
    // Billing + Mailing labels collide ("Street" / "City" / "Province" /
    // "Postal Code" / "Country" / "Unit / Suite" appear in BOTH sections).
    // Read those fields by absolute row number — billing in rows 13–18,
    // mailing in rows 22–27 — instead of label scan. Other sections still
    // use findValueByLabel since their labels are unique.
    billing: {
      street: cellToString(sheet.getRow(13).getCell(2)),
      unit: cellToString(sheet.getRow(14).getCell(2)),
      city: cellToString(sheet.getRow(15).getCell(2)),
      province: cellToString(sheet.getRow(16).getCell(2)),
      postal: cellToString(sheet.getRow(17).getCell(2)),
      country: cellToString(sheet.getRow(18).getCell(2)),
    },
    mailing: {
      street: cellToString(sheet.getRow(22).getCell(2)),
      unit: cellToString(sheet.getRow(23).getCell(2)),
      city: cellToString(sheet.getRow(24).getCell(2)),
      province: cellToString(sheet.getRow(25).getCell(2)),
      postal: cellToString(sheet.getRow(26).getCell(2)),
      country: cellToString(sheet.getRow(27).getCell(2)),
    },
    payment: {
      terms: mapPaymentTermsLabel(findValueByLabel(sheet, "Payment Terms")),
      terms_custom: findValueByLabel(
        sheet,
        "Custom Terms (if Payment Terms = Custom)"
      ),
      method: mapPaymentMethodLabel(
        findValueByLabel(sheet, "Preferred Payment Method")
      ),
      credit_limit: findValueByLabel(sheet, "Credit Limit (CAD)"),
      currency: findValueByLabel(sheet, "Currency"),
    },
    portal: {
      enabled: parseBooleanCell(portalEnabledRaw),
      email: findValueByLabel(sheet, "Portal Contact Email"),
    },
    notes: findValueAfterHeader(sheet, "NOTES"),
    contacts: scanContactsTable(sheet),
  };
}

