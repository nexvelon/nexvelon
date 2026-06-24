"use client";

import type { Cell, Worksheet } from "exceljs";
import {
  COUNTRIES,
  PROVINCES_BY_COUNTRY,
  PROVINCE_LIST_NAME_BY_COUNTRY,
} from "./countries";

// BULK client import Excel template — one row per client (vs the
// single-client form in lib/client-onboarding-template.ts which uses a
// label/value sheet for ONE client). This file mirrors the conventions
// of that module: "use client", dynamic `await import("exceljs")` so the
// ~1 MB lib stays out of the main bundle, the same style fills, the same
// DROPDOWN_PLACEHOLDER scheme, and the same INDIRECT-based dependent
// province dropdowns sourced from a hidden lookup band + named ranges.
//
// Differences from the single-client template:
//   * Sheet "Clients" is a wide table — row 1 is the column header row,
//     rows 2+ are one client each. Province dropdowns key off the SAME
//     ROW's country cell (so $D2 / $J2 / $P2 for row 2, $D3 / … for row 3).
//   * The parser returns ParsedBulkClient[] with per-row validation +
//     spreadsheet rowNumber for error messages.

// ─── Public types ──────────────────────────────────────────────────────────

export interface BulkAddress {
  country: string;
  province: string;
  street: string;
  unit: string;
  city: string;
  postal: string;
}

export interface BulkContact {
  first_name: string;
  last_name: string;
  email: string;
  phones: { label: string; number: string }[];
}

export interface ParsedBulkClient {
  rowNumber: number; // 1-based spreadsheet row of the data (for error messages)
  valid: boolean;
  errors: string[];
  data: {
    legal_name: string;
    display_name: string;
    status: string; // raw cell text ("Active" etc) or ""
    company: BulkAddress;
    billing: BulkAddress;
    mailing: BulkAddress;
    mailing_same_as: "" | "Billing" | "Company";
    hst_gst_number: string;
    tax_exempt: boolean | null; // Yes->true, No->false, blank->null
    tax_exempt_reason: string;
    payment_terms: string; // raw dropdown label (e.g. "Net 30") or ""
    currency: string; // raw dropdown label (e.g. "CAD") or ""
    primary: BulkContact; // phones: only non-empty {label,number}, up to 3
    ap: BulkContact;
    notes: string;
  };
}

// ─── Style constants (mirror client-onboarding-template.ts) ──────────────────

const VALUE_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFF9E6" },
} as const;
// Distinct fill for REQUIRED header cells (the * columns) so the operator
// can see at a glance which columns must be filled.
const REQUIRED_HEADER_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8C547" },
} as const;
// Plain bold header fill for optional columns.
const OPTIONAL_HEADER_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE5E5E5" },
} as const;
const SAMPLE_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEFF6FF" },
} as const;
const VALUE_BORDER = {
  top: { style: "thin", color: { argb: "FFCCCCCC" } },
  left: { style: "thin", color: { argb: "FFCCCCCC" } },
  bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
  right: { style: "thin", color: { argb: "FFCCCCCC" } },
} as const;

const YES_NO_OPTIONS = ["Yes", "No"];
const MAILING_SAME_AS_OPTIONS = ["", "Billing", "Company"];
const PHONE_LABEL_OPTIONS = [
  "Office",
  "Personal",
  "Mobile",
  "Work",
  "Emergency",
  "Fax",
  "Other",
];
const PAYMENT_TERMS_OPTIONS = [
  "Due on receipt",
  "Net 7",
  "Net 15",
  "Net 30",
  "Net 60",
  "Net 90",
];
const CURRENCY_OPTIONS = ["CAD", "USD", "AED", "INR", "EUR"];

// Reused from the single-client template (same value): an unselected
// dropdown holds this placeholder; the parser strips it back to "".
const DROPDOWN_PLACEHOLDER = "- - - Select from dropdown - - -";

// Version stamp lives in workbook.subject (hidden core property). The
// parser gates uploads on this string.
const VERSION_STAMP_VALUE = "nexvelon-client-bulk-v1";

const SHEET_NAME = "Clients";
const INSTRUCTIONS_SHEET_NAME = "Instructions";
const FIRST_DATA_ROW = 2;
const SAMPLE_ROW = 2; // styled sample row (operator deletes before import)
const LAST_DATA_ROW = 31; // ~30 data rows (rows 2–31)

// ─── Column map (1-indexed) ──────────────────────────────────────────────────
// Single source of truth for both the generator and the parser.

const COL = {
  LEGAL_NAME: 1,
  DISPLAY_NAME: 2,
  STATUS: 3,
  COMPANY_COUNTRY: 4,
  COMPANY_PROVINCE: 5,
  COMPANY_STREET: 6,
  COMPANY_UNIT: 7,
  COMPANY_CITY: 8,
  COMPANY_POSTAL: 9,
  BILLING_COUNTRY: 10,
  BILLING_PROVINCE: 11,
  BILLING_STREET: 12,
  BILLING_UNIT: 13,
  BILLING_CITY: 14,
  BILLING_POSTAL: 15,
  MAILING_COUNTRY: 16,
  MAILING_PROVINCE: 17,
  MAILING_STREET: 18,
  MAILING_UNIT: 19,
  MAILING_CITY: 20,
  MAILING_POSTAL: 21,
  MAILING_SAME_AS: 22,
  HST_GST_NUMBER: 23,
  TAX_EXEMPT: 24,
  TAX_EXEMPT_REASON: 25,
  PAYMENT_TERMS: 26,
  CURRENCY: 27,
  PRIMARY_FIRST_NAME: 28,
  PRIMARY_LAST_NAME: 29,
  PRIMARY_EMAIL: 30,
  PRIMARY_PHONE1_LABEL: 31,
  PRIMARY_PHONE1_NUMBER: 32,
  PRIMARY_PHONE2_LABEL: 33,
  PRIMARY_PHONE2_NUMBER: 34,
  PRIMARY_PHONE3_LABEL: 35,
  PRIMARY_PHONE3_NUMBER: 36,
  AP_FIRST_NAME: 37,
  AP_LAST_NAME: 38,
  AP_EMAIL: 39,
  AP_PHONE1_LABEL: 40,
  AP_PHONE1_NUMBER: 41,
  AP_PHONE2_LABEL: 42,
  AP_PHONE2_NUMBER: 43,
  AP_PHONE3_LABEL: 44,
  AP_PHONE3_NUMBER: 45,
  NOTES: 46,
} as const;

// Header definitions in column order. `required` drives the distinct fill +
// the trailing " *" already baked into the label.
interface HeaderDef {
  col: number;
  label: string;
  required?: boolean;
  width: number;
}

const HEADERS: HeaderDef[] = [
  { col: COL.LEGAL_NAME, label: "Legal Name *", required: true, width: 26 },
  { col: COL.DISPLAY_NAME, label: "Company Trade/Business Name", width: 28 },
  { col: COL.STATUS, label: "Status", width: 12 },
  {
    col: COL.COMPANY_COUNTRY,
    label: "Company Country *",
    required: true,
    width: 16,
  },
  {
    col: COL.COMPANY_PROVINCE,
    label: "Company Province *",
    required: true,
    width: 16,
  },
  {
    col: COL.COMPANY_STREET,
    label: "Company Street *",
    required: true,
    width: 22,
  },
  { col: COL.COMPANY_UNIT, label: "Company Unit", width: 12 },
  { col: COL.COMPANY_CITY, label: "Company City *", required: true, width: 16 },
  {
    col: COL.COMPANY_POSTAL,
    label: "Company Postal *",
    required: true,
    width: 14,
  },
  { col: COL.BILLING_COUNTRY, label: "Billing Country", width: 16 },
  { col: COL.BILLING_PROVINCE, label: "Billing Province", width: 16 },
  { col: COL.BILLING_STREET, label: "Billing Street", width: 22 },
  { col: COL.BILLING_UNIT, label: "Billing Unit", width: 12 },
  { col: COL.BILLING_CITY, label: "Billing City", width: 16 },
  { col: COL.BILLING_POSTAL, label: "Billing Postal", width: 14 },
  { col: COL.MAILING_COUNTRY, label: "Mailing Country", width: 16 },
  { col: COL.MAILING_PROVINCE, label: "Mailing Province", width: 16 },
  { col: COL.MAILING_STREET, label: "Mailing Street", width: 22 },
  { col: COL.MAILING_UNIT, label: "Mailing Unit", width: 12 },
  { col: COL.MAILING_CITY, label: "Mailing City", width: 16 },
  { col: COL.MAILING_POSTAL, label: "Mailing Postal", width: 14 },
  { col: COL.MAILING_SAME_AS, label: "Mailing Same As", width: 16 },
  { col: COL.HST_GST_NUMBER, label: "HST/GST Number", width: 18 },
  { col: COL.TAX_EXEMPT, label: "Tax Exempt", width: 12 },
  { col: COL.TAX_EXEMPT_REASON, label: "Tax Exempt Reason", width: 22 },
  { col: COL.PAYMENT_TERMS, label: "Default Payment Terms", width: 20 },
  { col: COL.CURRENCY, label: "Default Currency", width: 16 },
  { col: COL.PRIMARY_FIRST_NAME, label: "Primary First Name", width: 18 },
  { col: COL.PRIMARY_LAST_NAME, label: "Primary Last Name", width: 18 },
  { col: COL.PRIMARY_EMAIL, label: "Primary Email", width: 26 },
  { col: COL.PRIMARY_PHONE1_LABEL, label: "Primary Phone 1 Label", width: 18 },
  { col: COL.PRIMARY_PHONE1_NUMBER, label: "Primary Phone 1 Number", width: 20 },
  { col: COL.PRIMARY_PHONE2_LABEL, label: "Primary Phone 2 Label", width: 18 },
  { col: COL.PRIMARY_PHONE2_NUMBER, label: "Primary Phone 2 Number", width: 20 },
  { col: COL.PRIMARY_PHONE3_LABEL, label: "Primary Phone 3 Label", width: 18 },
  { col: COL.PRIMARY_PHONE3_NUMBER, label: "Primary Phone 3 Number", width: 20 },
  { col: COL.AP_FIRST_NAME, label: "AP First Name", width: 18 },
  { col: COL.AP_LAST_NAME, label: "AP Last Name", width: 18 },
  { col: COL.AP_EMAIL, label: "AP Email", width: 26 },
  { col: COL.AP_PHONE1_LABEL, label: "AP Phone 1 Label", width: 16 },
  { col: COL.AP_PHONE1_NUMBER, label: "AP Phone 1 Number", width: 18 },
  { col: COL.AP_PHONE2_LABEL, label: "AP Phone 2 Label", width: 16 },
  { col: COL.AP_PHONE2_NUMBER, label: "AP Phone 2 Number", width: 18 },
  { col: COL.AP_PHONE3_LABEL, label: "AP Phone 3 Label", width: 16 },
  { col: COL.AP_PHONE3_NUMBER, label: "AP Phone 3 Number", width: 18 },
  { col: COL.NOTES, label: "Notes", width: 40 },
];

// ─── Generator helpers ───────────────────────────────────────────────────────

/** Convert a 1-indexed column number to its Excel letter(s) (1→A, 27→AA). */
function colLetter(col: number): string {
  let n = col;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Apply a static list dropdown (with the placeholder prepended) to a cell. */
function applyListDropdown(cell: Cell, options: readonly string[]) {
  cell.value = DROPDOWN_PLACEHOLDER;
  cell.dataValidation = {
    type: "list",
    allowBlank: true,
    formulae: [`"${[DROPDOWN_PLACEHOLDER, ...options].join(",")}"`],
    showErrorMessage: false,
  };
  cell.alignment = { ...cell.alignment, horizontal: "center" };
}

/** Apply the static Country dropdown (COUNTRIES) to a cell. */
function applyCountryDropdown(cell: Cell) {
  applyListDropdown(cell, COUNTRIES);
}

/**
 * Apply a dependent Province / State dropdown to `cell` whose options are
 * sourced from the named range matching the country in `countryCellRef`.
 * Mirrors applyProvinceIndirectDropdown in the single-client template — the
 * INDIRECT formula resolves "Canada" → "Canada_Regions" via the uniform
 * `_Regions` suffix. In the bulk sheet `countryCellRef` is per-row (e.g.
 * "$D2" for row 2's company country) so each row's province dropdown keys
 * off that same row's country cell.
 */
function applyProvinceIndirectDropdown(cell: Cell, countryCellRef: string) {
  cell.value = DROPDOWN_PLACEHOLDER;
  cell.dataValidation = {
    type: "list",
    allowBlank: true,
    formulae: [`=INDIRECT(${countryCellRef} & "_Regions")`],
    showErrorMessage: false,
  };
  cell.alignment = { ...cell.alignment, horizontal: "center" };
}

// Hidden lookup band — same scheme as the single-client template, placed
// far below the data rows and triple-hidden (position + row.hidden + white
// font). Named ranges (Canada_Regions / USA_Regions / …) back the INDIRECT
// province dropdowns.
const HIDDEN_DATA_START_ROW = 201;

/**
 * Write the hidden region-lookup data inline on `sheet` + define one named
 * range per country. Replicates writeHiddenLookupData from the single-client
 * template (minus the LateFees table, which the bulk sheet doesn't use).
 */
function writeHiddenLookupData(
  workbook: import("exceljs").Workbook,
  sheet: Worksheet,
  sheetName: string
) {
  const colLetters = ["A", "B", "C", "D", "E"];
  const whiteFont = { color: { argb: "FFFFFFFF" } } as const;

  // ── Region lookup (cols A–E, one column per country) ──
  // Prepend DROPDOWN_PLACEHOLDER as row 0 of every region column so it
  // appears as the first item in every per-country province dropdown.
  COUNTRIES.forEach((country, colIdx) => {
    const provinces = PROVINCES_BY_COUNTRY[country];
    const placeholderCell = sheet.getCell(HIDDEN_DATA_START_ROW, colIdx + 1);
    placeholderCell.value = DROPDOWN_PLACEHOLDER;
    placeholderCell.font = whiteFont;
    provinces.forEach((province, rowIdx) => {
      const cell = sheet.getCell(
        HIDDEN_DATA_START_ROW + 1 + rowIdx,
        colIdx + 1
      );
      cell.value = province;
      cell.font = whiteFont;
    });
  });

  // ── Named range per country pointing at the lookup column ──
  // Sheet name is quoted so spaces work. endRow extended by +1 to cover
  // the prepended placeholder row.
  COUNTRIES.forEach((country, colIdx) => {
    const provinces = PROVINCES_BY_COUNTRY[country];
    const colLtr = colLetters[colIdx];
    const startRow = HIDDEN_DATA_START_ROW;
    const endRow = HIDDEN_DATA_START_ROW + provinces.length;
    const rangeRef = `'${sheetName}'!$${colLtr}$${startRow}:$${colLtr}$${endRow}`;
    workbook.definedNames.add(
      rangeRef,
      PROVINCE_LIST_NAME_BY_COUNTRY[country]
    );
  });

  // ── Hide every row in the lookup band ──
  const maxProvinceCount = Math.max(
    ...COUNTRIES.map((c) => PROVINCES_BY_COUNTRY[c].length)
  );
  const lastHiddenRow = HIDDEN_DATA_START_ROW + maxProvinceCount; // + placeholder row
  for (let r = HIDDEN_DATA_START_ROW; r <= lastHiddenRow; r++) {
    sheet.getRow(r).hidden = true;
  }
}

// Sample values used to seed the styled SAMPLE_ROW. Indexed by column.
const SAMPLE_VALUES: Record<number, string> = {
  [COL.LEGAL_NAME]: "Acme Logistics Inc.",
  [COL.DISPLAY_NAME]: "Acme",
  [COL.STATUS]: "Active",
  [COL.COMPANY_COUNTRY]: "Canada",
  [COL.COMPANY_PROVINCE]: "ON",
  [COL.COMPANY_STREET]: "123 King St W",
  [COL.COMPANY_UNIT]: "Suite 400",
  [COL.COMPANY_CITY]: "Toronto",
  [COL.COMPANY_POSTAL]: "M5H 1A1",
  [COL.MAILING_SAME_AS]: "Company",
  [COL.HST_GST_NUMBER]: "123456789RT0001",
  [COL.TAX_EXEMPT]: "No",
  [COL.PAYMENT_TERMS]: "Net 30",
  [COL.CURRENCY]: "CAD",
  [COL.PRIMARY_FIRST_NAME]: "Jane",
  [COL.PRIMARY_LAST_NAME]: "Doe",
  [COL.PRIMARY_EMAIL]: "jane@acme.example",
  [COL.PRIMARY_PHONE1_LABEL]: "Office",
  [COL.PRIMARY_PHONE1_NUMBER]: "416-555-0100",
  [COL.NOTES]: "Sample row — delete before importing.",
};

// ─── Generator ───────────────────────────────────────────────────────────────

/**
 * Generate the bulk client import template. Returns the raw xlsx buffer
 * (cast to ArrayBuffer) so the caller can wrap it in a Blob / download.
 */
export async function generateClientBulkTemplate(): Promise<ArrayBuffer> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Nexvelon";
  workbook.subject = VERSION_STAMP_VALUE;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(SHEET_NAME);

  // Freeze the header row so it stays visible while scrolling many clients.
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  // ── Header row (row 1) ──
  const headerRow = sheet.getRow(1);
  for (const def of HEADERS) {
    const cell = headerRow.getCell(def.col);
    cell.value = def.label;
    cell.font = { bold: true, color: { argb: "FF000000" } };
    cell.fill = def.required ? REQUIRED_HEADER_FILL : OPTIONAL_HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = VALUE_BORDER;
    sheet.getColumn(def.col).width = def.width;
  }
  headerRow.height = 30;

  // ── Data rows (2–31): styling + dropdowns/validation per column ──
  for (let r = FIRST_DATA_ROW; r <= LAST_DATA_ROW; r++) {
    const row = sheet.getRow(r);
    const isSample = r === SAMPLE_ROW;

    for (const def of HEADERS) {
      const cell = row.getCell(def.col);
      cell.fill = isSample ? SAMPLE_FILL : VALUE_FILL;
      cell.border = VALUE_BORDER;
      cell.alignment = { vertical: "middle", horizontal: "left" };
    }

    // Country dropdowns (company / billing / mailing).
    applyCountryDropdown(row.getCell(COL.COMPANY_COUNTRY));
    applyCountryDropdown(row.getCell(COL.BILLING_COUNTRY));
    applyCountryDropdown(row.getCell(COL.MAILING_COUNTRY));

    // Province dropdowns key off the SAME ROW's matching country cell:
    //   company province (col 5) → $D{r}
    //   billing province (col 11) → $J{r}
    //   mailing province (col 17) → $P{r}
    applyProvinceIndirectDropdown(
      row.getCell(COL.COMPANY_PROVINCE),
      `$${colLetter(COL.COMPANY_COUNTRY)}${r}`
    );
    applyProvinceIndirectDropdown(
      row.getCell(COL.BILLING_PROVINCE),
      `$${colLetter(COL.BILLING_COUNTRY)}${r}`
    );
    applyProvinceIndirectDropdown(
      row.getCell(COL.MAILING_PROVINCE),
      `$${colLetter(COL.MAILING_COUNTRY)}${r}`
    );

    // Mailing Same As.
    applyListDropdown(row.getCell(COL.MAILING_SAME_AS), MAILING_SAME_AS_OPTIONS);
    // Tax Exempt.
    applyListDropdown(row.getCell(COL.TAX_EXEMPT), YES_NO_OPTIONS);
    // Payment Terms + Currency.
    applyListDropdown(row.getCell(COL.PAYMENT_TERMS), PAYMENT_TERMS_OPTIONS);
    applyListDropdown(row.getCell(COL.CURRENCY), CURRENCY_OPTIONS);
    // Phone label columns.
    for (const c of [
      COL.PRIMARY_PHONE1_LABEL,
      COL.PRIMARY_PHONE2_LABEL,
      COL.PRIMARY_PHONE3_LABEL,
      COL.AP_PHONE1_LABEL,
      COL.AP_PHONE2_LABEL,
      COL.AP_PHONE3_LABEL,
    ]) {
      applyListDropdown(row.getCell(c), PHONE_LABEL_OPTIONS);
    }

    // Sample row: seed example values over the placeholders (where defined)
    // and lightly mark it. The parser skips any row with an empty Legal
    // Name, so deleting the sample contents won't create an error row.
    if (isSample) {
      for (const def of HEADERS) {
        const sampleVal = SAMPLE_VALUES[def.col];
        if (sampleVal !== undefined) {
          row.getCell(def.col).value = sampleVal;
        }
      }
      row.getCell(COL.LEGAL_NAME).font = { italic: true, color: { argb: "FF555555" } };
    }

    row.height = 18;
  }

  // Hidden lookup band + named ranges (backs the INDIRECT province dropdowns).
  writeHiddenLookupData(workbook, sheet, SHEET_NAME);

  // ── Instructions sheet ──
  const instr = workbook.addWorksheet(INSTRUCTIONS_SHEET_NAME);
  instr.getColumn(1).width = 110;
  const instrLines: { text: string; header?: boolean }[] = [
    { text: "Bulk Client Import — Instructions", header: true },
    { text: "" },
    {
      text:
        "Fill in ONE row per client on the 'Clients' tab. Columns marked with * are required.",
    },
    {
      text:
        "Required: Legal Name, Company Country, Company Province, Company Street, Company City, Company Postal.",
    },
    { text: "" },
    {
      text:
        "Billing Address: leave ALL billing columns blank to inherit the Company address. If you fill any billing column, you must fill Country, Province, Street, City and Postal (no partial addresses).",
    },
    {
      text:
        "Mailing Address: same partial-fill rule as Billing. Use the 'Mailing Same As' column = 'Billing' or 'Company' to reuse that address, or leave it blank and enter the mailing address manually.",
    },
    { text: "" },
    {
      text:
        "Province / State dropdowns depend on the Country selected in the SAME ROW. If you change a Country, re-select its Province — the options change but the cell value does not auto-clear.",
    },
    {
      text:
        "Contacts: each client can have a Primary contact and an AP (Accounts Payable) contact, with up to 3 phone numbers each. Leave phone columns blank if not used.",
    },
    {
      text:
        "Tax Exempt: choose Yes or No from the dropdown (leave blank if unknown).",
    },
    { text: "" },
    {
      text:
        "IMPORTANT: Row 2 is a sample row showing example values. Delete the sample row before importing.",
    },
  ];
  instrLines.forEach((line, i) => {
    const cell = instr.getCell(i + 1, 1);
    cell.value = line.text;
    cell.font = line.header
      ? { bold: true, size: 14 }
      : { size: 11, color: { argb: "FF333333" } };
    cell.alignment = { vertical: "middle", wrapText: true, horizontal: "left" };
  });

  // ── Output ──
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

// ─── Parser helpers ──────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Read a cell as a trimmed string, stripping the dropdown placeholder. */
function cellToString(sheet: Worksheet, row: number, col: number): string {
  const v = sheet.getRow(row).getCell(col).value;
  const s = v == null ? "" : String(v).trim();
  return s === DROPDOWN_PLACEHOLDER ? "" : s;
}

/** Build a BulkAddress from a contiguous 6-column block starting at `startCol`. */
function readAddress(
  sheet: Worksheet,
  row: number,
  startCol: number
): BulkAddress {
  return {
    country: cellToString(sheet, row, startCol),
    province: cellToString(sheet, row, startCol + 1),
    street: cellToString(sheet, row, startCol + 2),
    unit: cellToString(sheet, row, startCol + 3),
    city: cellToString(sheet, row, startCol + 4),
    postal: cellToString(sheet, row, startCol + 5),
  };
}

/** Collect up-to-3 phones from the given label/number column pairs. */
function readPhones(
  sheet: Worksheet,
  row: number,
  pairs: [number, number][]
): { label: string; number: string }[] {
  const phones: { label: string; number: string }[] = [];
  for (const [labelCol, numberCol] of pairs) {
    const number = cellToString(sheet, row, numberCol);
    if (!number) continue;
    const label = cellToString(sheet, row, labelCol) || "Phone";
    phones.push({ label, number });
  }
  return phones;
}

/**
 * Validate an optional address block: if ANY of country/province/street/
 * city/postal is filled, ALL of them must be (unit stays optional). Returns
 * an error message or null.
 */
function partialAddressError(addr: BulkAddress, name: string): string | null {
  const required = [
    addr.country,
    addr.province,
    addr.street,
    addr.city,
    addr.postal,
  ];
  const anyFilled = required.some((v) => v !== "");
  const allFilled = required.every((v) => v !== "");
  if (anyFilled && !allFilled) {
    return `${name} address is partially filled`;
  }
  return null;
}

// ─── Parser ──────────────────────────────────────────────────────────────────

/**
 * Parse a filled bulk template into ParsedBulkClient[]. Throws if the file
 * isn't a recognizable bulk template (wrong version stamp, missing 'Clients'
 * sheet, or a header row that doesn't start with "Legal Name").
 *
 * Per-row: fully-empty rows (no Legal Name AND no company fields) are
 * skipped entirely. Every other row is emitted with its spreadsheet
 * rowNumber, parsed data, and per-row validation errors.
 */
export async function parseClientBulkTemplate(
  file: File
): Promise<ParsedBulkClient[]> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const subject = workbook.subject ?? "";
  if (!subject.includes(VERSION_STAMP_VALUE)) {
    throw new Error(
      "This file is not a recognized bulk client import template. Please download a fresh template using the 'Download Bulk Template' button."
    );
  }

  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) {
    throw new Error(
      "The uploaded file is missing the 'Clients' sheet. Please download a fresh bulk client import template."
    );
  }

  // Basic header sanity: row 1, col 1 must read "Legal Name".
  const headerCell = sheet.getRow(1).getCell(COL.LEGAL_NAME).value;
  const headerText = (headerCell == null ? "" : String(headerCell))
    .trim()
    .toLowerCase()
    .replace(/\*/g, "")
    .trim();
  if (headerText !== "legal name") {
    throw new Error(
      "The 'Clients' sheet header looks wrong (expected 'Legal Name' in the first column). Please download a fresh bulk client import template."
    );
  }

  const results: ParsedBulkClient[] = [];

  for (let r = FIRST_DATA_ROW; r <= sheet.rowCount; r++) {
    const legalName = cellToString(sheet, r, COL.LEGAL_NAME);
    const company = readAddress(sheet, r, COL.COMPANY_COUNTRY);

    // Skip fully-empty rows (no Legal Name AND no company fields).
    const companyHasAny = Object.values(company).some((v) => v !== "");
    if (!legalName && !companyHasAny) continue;

    const billing = readAddress(sheet, r, COL.BILLING_COUNTRY);
    const mailing = readAddress(sheet, r, COL.MAILING_COUNTRY);

    const displayName = cellToString(sheet, r, COL.DISPLAY_NAME);
    const status = cellToString(sheet, r, COL.STATUS);
    const hstGst = cellToString(sheet, r, COL.HST_GST_NUMBER);
    const taxExemptRaw = cellToString(sheet, r, COL.TAX_EXEMPT);
    const taxExemptReason = cellToString(sheet, r, COL.TAX_EXEMPT_REASON);
    const paymentTerms = cellToString(sheet, r, COL.PAYMENT_TERMS);
    const currency = cellToString(sheet, r, COL.CURRENCY);
    const notes = cellToString(sheet, r, COL.NOTES);

    const primary: BulkContact = {
      first_name: cellToString(sheet, r, COL.PRIMARY_FIRST_NAME),
      last_name: cellToString(sheet, r, COL.PRIMARY_LAST_NAME),
      email: cellToString(sheet, r, COL.PRIMARY_EMAIL),
      phones: readPhones(sheet, r, [
        [COL.PRIMARY_PHONE1_LABEL, COL.PRIMARY_PHONE1_NUMBER],
        [COL.PRIMARY_PHONE2_LABEL, COL.PRIMARY_PHONE2_NUMBER],
        [COL.PRIMARY_PHONE3_LABEL, COL.PRIMARY_PHONE3_NUMBER],
      ]),
    };
    const ap: BulkContact = {
      first_name: cellToString(sheet, r, COL.AP_FIRST_NAME),
      last_name: cellToString(sheet, r, COL.AP_LAST_NAME),
      email: cellToString(sheet, r, COL.AP_EMAIL),
      phones: readPhones(sheet, r, [
        [COL.AP_PHONE1_LABEL, COL.AP_PHONE1_NUMBER],
        [COL.AP_PHONE2_LABEL, COL.AP_PHONE2_NUMBER],
        [COL.AP_PHONE3_LABEL, COL.AP_PHONE3_NUMBER],
      ]),
    };

    const errors: string[] = [];

    // Legal Name required.
    if (!legalName) errors.push("Legal Name is required");

    // Company address — all required except unit.
    if (!company.country) errors.push("Company Country is required");
    if (!company.province) errors.push("Company Province is required");
    if (!company.street) errors.push("Company Street is required");
    if (!company.city) errors.push("Company City is required");
    if (!company.postal) errors.push("Company Postal is required");

    // Billing + Mailing partial-fill checks.
    const billingErr = partialAddressError(billing, "Billing");
    if (billingErr) errors.push(billingErr);
    const mailingErr = partialAddressError(mailing, "Mailing");
    if (mailingErr) errors.push(mailingErr);

    // Mailing Same As: normalize to "" | "Billing" | "Company".
    const mailingSameAsRaw = cellToString(sheet, r, COL.MAILING_SAME_AS);
    let mailingSameAs: "" | "Billing" | "Company" = "";
    if (mailingSameAsRaw) {
      const v = mailingSameAsRaw.toLowerCase();
      if (v === "billing") mailingSameAs = "Billing";
      else if (v === "company") mailingSameAs = "Company";
      else errors.push("Mailing Same As must be 'Billing' or 'Company'");
    }

    // Tax Exempt: Yes->true, No->false, blank->null, anything else->error.
    let taxExempt: boolean | null = null;
    if (taxExemptRaw) {
      const v = taxExemptRaw.toLowerCase();
      if (v === "yes") taxExempt = true;
      else if (v === "no") taxExempt = false;
      else errors.push("Tax Exempt must be Yes or No");
    }

    // Emails: validate when present.
    if (primary.email && !EMAIL_RE.test(primary.email)) {
      errors.push("Primary Email is not a valid email address");
    }
    if (ap.email && !EMAIL_RE.test(ap.email)) {
      errors.push("AP Email is not a valid email address");
    }

    results.push({
      rowNumber: r,
      valid: errors.length === 0,
      errors,
      data: {
        legal_name: legalName,
        display_name: displayName,
        status,
        company,
        billing,
        mailing,
        mailing_same_as: mailingSameAs,
        hst_gst_number: hstGst,
        tax_exempt: taxExempt,
        tax_exempt_reason: taxExemptReason,
        payment_terms: paymentTerms,
        currency,
        primary,
        ap,
        notes,
      },
    });
  }

  return results;
}
