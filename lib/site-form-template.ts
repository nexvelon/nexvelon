"use client";

import type { Cell, Worksheet } from "exceljs";
import {
  COUNTRIES,
  PROVINCES_BY_COUNTRY,
  PROVINCE_LIST_NAME_BY_COUNTRY,
} from "./countries";
import { LATE_PAYMENT_RATES_BY_COUNTRY } from "./late-payment-rates";

// SITES-3 — single-sheet Site Form Excel template.
//
// Parallels lib/client-onboarding-template.ts (post CL-19) — same
// helpers, same constants, same overall section flow — with two new
// sections at the top:
//
//   * SITE INFORMATION   — single field (Site/Project Name)
//   * SITE ADDRESS       — 6 fields (physical address; mandatory *)
//
// All other sections (Billing / Mailing / Tax / Payment + locked
// terms-and-conditions block / Contacts) are byte-for-byte identical
// to the Client Form template. The single point of divergence is
// `workbook.subject = "nexvelon-site-v1"` (vs Client Form's
// "nexvelon-onboarding-v3"), so cross-template uploads fail with a
// friendly "older version or different template type" error.
//
// Code reuse: helpers + style constants are duplicated here for v1
// rather than extracted to a shared module — keeps each template
// self-contained so they can evolve independently. Refactor to a
// shared `lib/excel-form-template-shared.ts` is a future option if
// both templates need lockstep patching.
//
// exceljs is dynamic-imported in each function so the ~1 MB lib stays
// out of the main bundle. `import type` above is erased at compile.

// ─── Public types ──────────────────────────────────────────────────────────

export interface ParsedContact {
  first_name: string;
  last_name: string;
  /** Pre-filled Type column value (e.g. "Primary Contact Work"). The
   *  parser returns it verbatim; the merge logic in SiteForm uses it
   *  to derive the row's intent + the phone label. */
  type_label: string;
  role: string; // maps to DbContact.title; client may type their own
  email: string;
  phone: string;
}

export interface ParsedSiteTemplate {
  site: {
    name: string;
    // Physical address — distinct from billing/mailing.
    address_line1: string;
    address_line2: string;
    city: string;
    province: string;
    postal_code: string;
    country: string;
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
  tax: {
    hst_gst_number: string;
    tax_exempt: boolean | null;
    tax_exempt_cert: string;
  };
  payment: {
    terms: string; // "due_on_receipt" | "net_7" | "net_15" | "net_30" | ""
    method: string; // "eft" | "e_transfer" | "wire" | "credit_card" | "cash" | ""
    currency: string; // "CAD" | "USD" | ""
  };
  contacts: ParsedContact[]; // exactly 4 rows
}

// ─── Style constants (duplicated from client template) ────────────────────

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
const TYPE_CELL_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEFEFEF" },
} as const;
const LOCKED_TEXT_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFFFFF" },
} as const;
const VALUE_BORDER = {
  top: { style: "thin", color: { argb: "FFCCCCCC" } },
  left: { style: "thin", color: { argb: "FFCCCCCC" } },
  bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
  right: { style: "thin", color: { argb: "FFCCCCCC" } },
} as const;

// ADDR-1: PROVINCE_OPTIONS removed — replaced by per-country INDIRECT
// dropdowns sourced from a hidden Lists sheet. See
// generateSiteTemplate for the named-range setup.
// CL-20: COUNTRY_DROPDOWN constant removed — applyCountryDropdown now
// builds the formula inline so it can prepend DROPDOWN_PLACEHOLDER.
const YES_NO_OPTIONS = ["Yes", "No"];
const PAYMENT_TERMS_LABELS = ["Due on receipt", "NET 7", "NET 15", "NET 30"];
const PAYMENT_METHOD_LABELS = [
  "EFT",
  "e-Transfer",
  "Wire",
  "Credit Card",
  "Cash",
];
// CL-20: expanded to 5 currencies (mirrors client template).
const CURRENCY_OPTIONS = ["CAD", "USD", "AED", "INR", "EUR"];

// CL-20: placeholder text for dropdown cells. See client template.
const DROPDOWN_PLACEHOLDER = "- - - Select from dropdown - - -";

const PAYMENT_TERMS_LABEL_TO_VALUE: Record<string, string> = {
  "due on receipt": "due_on_receipt",
  "net 7": "net_7",
  "net 15": "net_15",
  "net 30": "net_30",
};
const PAYMENT_METHOD_LABEL_TO_VALUE: Record<string, string> = {
  eft: "eft",
  "e-transfer": "e_transfer",
  wire: "wire",
  "credit card": "credit_card",
  cash: "cash",
};

// SITES-3 deltas from client template:
const TITLE_TEXT = "Site Form";
const SUBTITLE_TEXT =
  "Kindly complete the fields below — required fields marked with *";
// Distinct stamp from "nexvelon-onboarding-v3" so cross-template
// uploads fail with the friendly older-version error.
const VERSION_STAMP_VALUE = "nexvelon-site-v1";

// ADDR-2: PAYMENT_TERMS_AND_CONDITIONS_TEXT constant removed — locked
// text now uses a dynamic Excel formula keyed off the BILLING country
// cell ($B$17 in this template). Per-country rates live in
// lib/late-payment-rates.ts.

const CONTACT_TYPE_LABELS = [
  "Primary Contact Work",
  "Primary Contact Personal",
  "AP work/ext",
  "AP direct",
] as const;

// ─── Generator helpers (duplicated from client template) ──────────────────

function sectionHeader(sheet: Worksheet, rowNum: number, title: string) {
  const row = sheet.getRow(rowNum);
  row.getCell(1).value = title;
  row.getCell(1).font = { bold: true, size: 12, color: { argb: "FF000000" } };
  row.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  sheet.mergeCells(rowNum, 1, rowNum, 2);
  for (let c = 1; c <= 2; c++) {
    row.getCell(c).fill = SECTION_HEADER_FILL;
  }
  row.height = 22;
}

function sectionHeaderRange(
  sheet: Worksheet,
  rowNum: number,
  title: string,
  endCol: number
) {
  const row = sheet.getRow(rowNum);
  row.getCell(1).value = title;
  row.getCell(1).font = { bold: true, size: 12, color: { argb: "FF000000" } };
  row.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  sheet.mergeCells(rowNum, 1, rowNum, endCol);
  for (let c = 1; c <= endCol; c++) {
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
    dropdown?: readonly string[];
  } = {}
) {
  // CL-20: dropdown cells pre-fill with DROPDOWN_PLACEHOLDER + include
  // it as the first item in the validation list (mirrors client
  // template). Parser strips placeholder values back to "" on read.
  const row = sheet.getRow(rowNum);
  row.getCell(1).value = label + (options.required ? " *" : "");
  row.getCell(1).font = { bold: true };
  row.getCell(1).fill = LABEL_FILL;
  row.getCell(1).alignment = { vertical: "middle" };
  row.getCell(2).fill = VALUE_FILL;
  row.getCell(2).border = VALUE_BORDER;
  row.getCell(2).alignment = { vertical: "middle", wrapText: true };
  if (options.dropdown) {
    row.getCell(2).value = DROPDOWN_PLACEHOLDER;
    row.getCell(2).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${[DROPDOWN_PLACEHOLDER, ...options.dropdown].join(",")}"`],
      showErrorMessage: false,
    };
  } else {
    row.getCell(2).value = "";
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

// ─── ADDR-1: dependent-dropdown wiring helpers ────────────────────────────

// CL-20: country cell pre-fills with DROPDOWN_PLACEHOLDER + placeholder
// is injected as the first list item so Excel doesn't flag it invalid.
function applyCountryDropdown(cell: Cell) {
  cell.value = DROPDOWN_PLACEHOLDER;
  cell.dataValidation = {
    type: "list",
    allowBlank: true,
    formulae: [`"${[DROPDOWN_PLACEHOLDER, ...COUNTRIES].join(",")}"`],
    showErrorMessage: false,
  };
}

// CL-20: province cell pre-fills with DROPDOWN_PLACEHOLDER. The
// placeholder also lives as the first row of each region's hidden
// lookup column (see writeHiddenLookupData) so it appears as the first
// item in every per-country INDIRECT province dropdown.
function applyProvinceIndirectDropdown(cell: Cell, countryCellRef: string) {
  cell.value = DROPDOWN_PLACEHOLDER;
  cell.dataValidation = {
    type: "list",
    allowBlank: true,
    formulae: [`=INDIRECT(${countryCellRef} & "_Regions")`],
    showErrorMessage: false,
  };
}

// ADDR-2: lookup data lives inline on the main sheet (was a separate
// hidden "Lists" tab in ADDR-1, which appeared in the bottom tab strip
// and looked unprofessional). Mirrors lib/client-onboarding-template's
// writeHiddenLookupData — duplicated per the SITES-3 decision to keep
// each template self-contained.
const HIDDEN_DATA_START_ROW = 201;
// CL-20: late-fees table starts dynamically below the longest region
// column. Region columns now include a DROPDOWN_PLACEHOLDER row at
// position 0 (effective max region row count = maxProvinces + 1). An
// extra 8-row buffer keeps things future-proof.
const MAX_PROVINCE_COUNT = Math.max(
  ...COUNTRIES.map((c) => PROVINCES_BY_COUNTRY[c].length)
);
const LATE_FEES_START_ROW =
  HIDDEN_DATA_START_ROW + MAX_PROVINCE_COUNT + 1 + 8;

function writeHiddenLookupData(
  workbook: import("exceljs").Workbook,
  sheet: Worksheet,
  sheetName: string
) {
  const colLetters = ["A", "B", "C", "D", "E"];
  const whiteFont = { color: { argb: "FFFFFFFF" } } as const;

  // Region lookup (cols A–E, one column per country).
  // CL-20: prepend DROPDOWN_PLACEHOLDER as row 0 of every region column
  // so it appears as the first item in every per-country INDIRECT
  // province dropdown. Parser strips placeholder back to "".
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

  // CL-20: endRow extended by +1 to cover the prepended placeholder row.
  COUNTRIES.forEach((country, colIdx) => {
    const provinces = PROVINCES_BY_COUNTRY[country];
    const colLetter = colLetters[colIdx];
    const startRow = HIDDEN_DATA_START_ROW;
    const endRow = HIDDEN_DATA_START_ROW + provinces.length;
    const rangeRef = `'${sheetName}'!$${colLetter}$${startRow}:$${colLetter}$${endRow}`;
    workbook.definedNames.add(
      rangeRef,
      PROVINCE_LIST_NAME_BY_COUNTRY[country]
    );
  });

  // Late-fees lookup (col A: country, B: monthly%, C: annual%, D: ccSurchargePct%).
  COUNTRIES.forEach((country, idx) => {
    const r = LATE_FEES_START_ROW + idx;
    const rates = LATE_PAYMENT_RATES_BY_COUNTRY[country];
    sheet.getCell(r, 1).value = country;
    sheet.getCell(r, 2).value = rates.monthlyPct;
    sheet.getCell(r, 3).value = rates.annualPct;
    sheet.getCell(r, 4).value = rates.ccSurchargePct;
    for (let c = 1; c <= 4; c++) {
      sheet.getCell(r, c).font = whiteFont;
    }
  });

  const lateFeesRangeRef = `'${sheetName}'!$A$${LATE_FEES_START_ROW}:$D$${
    LATE_FEES_START_ROW + COUNTRIES.length - 1
  }`;
  workbook.definedNames.add(lateFeesRangeRef, "LateFees");

  for (
    let r = HIDDEN_DATA_START_ROW;
    r <= LATE_FEES_START_ROW + COUNTRIES.length - 1;
    r++
  ) {
    sheet.getRow(r).hidden = true;
  }
}

// ─── Generator ─────────────────────────────────────────────────────────────

/**
 * Generate the single-sheet Site Form Excel template. Returns a Blob
 * downloadable via URL.createObjectURL.
 *
 * Section layout:
 *   R1-2   Title + subtitle (merged A:L)
 *   R5-6   SITE INFORMATION + Site/Project Name
 *   R8-14  SITE ADDRESS + 6 fields
 *   R16-22 BILLING ADDRESS + 6 fields
 *   R24-31 MAILING ADDRESS + hint + 6 fields
 *   R33-36 TAX + 3 fields
 *   R38    PAYMENT TERMS & METHOD header
 *   R39-42 Locked terms-and-conditions block (merged A:L)
 *   R44-46 Select Payment Terms / Method / Currency
 *   R48-54 CONTACTS + hint + 4 data rows
 */
export async function generateSiteTemplate(): Promise<Blob> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Nexvelon";
  workbook.subject = VERSION_STAMP_VALUE;

  // ADDR-2: lookup data lives on the main sheet (was a separate hidden
  // "Lists" tab in ADDR-1). writeHiddenLookupData() is called near the
  // end of this function once the main sheet exists.

  const sheet = workbook.addWorksheet("Site Onboarding");
  sheet.views = [{ state: "frozen", ySplit: 3 }];

  // Col widths — A=35 matches client template (CL-18). Other cols
  // sized for the contacts table.
  sheet.columns = [
    { width: 35 }, // A — labels / First Name
    { width: 38 }, // B — values / Last Name
    { width: 25 }, // C — Type
    { width: 25 }, // D — Role
    { width: 30 }, // E — Email
    { width: 20 }, // F — Phone
    { width: 8 },
    { width: 8 },
    { width: 8 },
    { width: 8 },
    { width: 8 },
    { width: 8 },
  ];

  // ─── Title block (rows 1–2) ───
  sheet.getCell("A1").value = TITLE_TEXT;
  sheet.getCell("A1").font = { bold: true, size: 16 };
  sheet.getCell("A1").alignment = {
    vertical: "middle",
    horizontal: "center",
    wrapText: true,
  };
  sheet.mergeCells("A1:L1");
  sheet.getRow(1).height = 28;

  sheet.getCell("A2").value = SUBTITLE_TEXT;
  sheet.getCell("A2").font = {
    italic: true,
    color: { argb: "FF666666" },
    size: 11,
  };
  sheet.getCell("A2").alignment = {
    vertical: "middle",
    horizontal: "center",
    wrapText: true,
  };
  sheet.mergeCells("A2:L2");
  sheet.getRow(2).height = 22;

  // ─── Section 1: SITE INFORMATION (rows 5–6) ───
  sectionHeader(sheet, 5, "SITE INFORMATION");
  // SITES-4: "Site Name" → "Site/Project Name". Internal field name on
  // DbSite stays `name`; this is a user-facing label change only.
  labelValueRow(sheet, 6, "Site/Project Name", { required: true });

  // ─── Section 2: SITE ADDRESS (rows 8–14) ───
  // ADDR-1 layout: Country (R9) → Province (R10) → Street (R11) →
  // Unit (R12) → City (R13) → Postal (R14). Physical site location —
  // distinct from billing/mailing sections below.
  sectionHeader(sheet, 8, "SITE ADDRESS");
  labelValueRow(sheet, 9, "Country", { required: true });
  applyCountryDropdown(sheet.getCell("B9"));
  labelValueRow(sheet, 10, "Province / State", { required: true });
  applyProvinceIndirectDropdown(sheet.getCell("B10"), "$B$9");
  // ADDR-2: hover comment nudges the operator after a country change.
  sheet.getCell("B10").note =
    "If you change Country, please re-select Province / State — the dropdown options change but the cell value does not auto-clear.";
  labelValueRow(sheet, 11, "Street", { required: true });
  labelValueRow(sheet, 12, "Unit / Suite", { required: true });
  labelValueRow(sheet, 13, "City", { required: true });
  labelValueRow(sheet, 14, "Postal Code", { required: true });

  // ─── Section 3: BILLING ADDRESS (rows 16–22) ───
  // ADDR-1: same Country-first reorder; rows 17–22.
  sectionHeader(sheet, 16, "BILLING ADDRESS");
  labelValueRow(sheet, 17, "Country", { required: true });
  applyCountryDropdown(sheet.getCell("B17"));
  labelValueRow(sheet, 18, "Province / State", { required: true });
  applyProvinceIndirectDropdown(sheet.getCell("B18"), "$B$17");
  sheet.getCell("B18").note =
    "If you change Country, please re-select Province / State — the dropdown options change but the cell value does not auto-clear.";
  labelValueRow(sheet, 19, "Street", { required: true });
  labelValueRow(sheet, 20, "Unit / Suite", { required: true });
  labelValueRow(sheet, 21, "City", { required: true });
  labelValueRow(sheet, 22, "Postal Code", { required: true });

  // ─── Section 4: MAILING ADDRESS (rows 24–31) ───
  // ADDR-1: same Country-first reorder; rows 26–31 now C/P/S/U/Ci/PC.
  // SiteForm's handleUploadTemplate detects all-blank mailing and
  // sets mailing_same_as_billing=true. The * markers are visual
  // only — parser-side behaviour unchanged.
  sectionHeader(sheet, 24, "MAILING ADDRESS");
  noteRow(
    sheet,
    25,
    "Kindly leave all fields blank if mailing address will be same as billing address"
  );
  labelValueRow(sheet, 26, "Country", { required: true });
  applyCountryDropdown(sheet.getCell("B26"));
  labelValueRow(sheet, 27, "Province / State", { required: true });
  applyProvinceIndirectDropdown(sheet.getCell("B27"), "$B$26");
  sheet.getCell("B27").note =
    "If you change Country, please re-select Province / State — the dropdown options change but the cell value does not auto-clear.";
  labelValueRow(sheet, 28, "Street", { required: true });
  labelValueRow(sheet, 29, "Unit / Suite", { required: true });
  labelValueRow(sheet, 30, "City", { required: true });
  labelValueRow(sheet, 31, "Postal Code", { required: true });

  // ─── Section 5: TAX (rows 33–36) ───
  sectionHeader(sheet, 33, "TAX");
  labelValueRow(sheet, 34, "HST / GST Number", { required: true });
  labelValueRow(sheet, 35, "Tax Exempt?", {
    required: true,
    dropdown: YES_NO_OPTIONS,
  });
  labelValueRow(sheet, 36, "If Tax Exempt, Enter Certificate Number");

  // ─── Section 6: PAYMENT TERMS & METHOD (rows 38–46) ───
  sectionHeader(sheet, 38, "PAYMENT TERMS & METHOD");

  // Locked payment-terms-and-conditions block.
  // ADDR-2: text is now a DYNAMIC Excel formula that pulls per-country
  // rates from the hidden LateFees named range, keyed off the BILLING
  // country cell ($B$17). IFERROR fallback uses Canada defaults when no
  // billing country is selected.
  //
  // Styling unchanged from CL-13/CL-19: bold black 11pt on white fill.
  // Visual-only locking (no cell.protection / sheet.protect).
  sheet.mergeCells("A39:L42");
  const lateCell = sheet.getCell("A39");
  lateCell.value = {
    formula:
      '="Payment terms and conditions:" & CHAR(10) & ' +
      '"1> Invoices not settled beyond the selected payment term accrues interest at a rate of " & ' +
      "IFERROR(VLOOKUP($B$17,LateFees,2,FALSE),2.91) & " +
      '"% per month (" & ' +
      "IFERROR(VLOOKUP($B$17,LateFees,3,FALSE),35) & " +
      '"% per annum) effective from that due date on all outstanding balances." & CHAR(10) & ' +
      '"2> Credit card payments will incur a " & ' +
      "IFERROR(VLOOKUP($B$17,LateFees,4,FALSE),2.4) & " +
      '"% merchant processing surcharge. To avoid this fee, you may choose to pay via EFT."',
    result: "",
  };
  lateCell.font = {
    bold: true,
    color: { argb: "FF000000" },
    size: 11,
  };
  // CL-20: vertical center (was "top") — text now visually centered.
  lateCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  lateCell.fill = LOCKED_TEXT_FILL;
  lateCell.border = VALUE_BORDER;
  for (let r = 39; r <= 42; r++) sheet.getRow(r).height = 22;

  // Row 43 spacer.
  labelValueRow(sheet, 44, "Select Payment Terms", {
    required: true,
    dropdown: PAYMENT_TERMS_LABELS,
  });
  labelValueRow(sheet, 45, "Select Payment Method", {
    required: true,
    dropdown: PAYMENT_METHOD_LABELS,
  });
  labelValueRow(sheet, 46, "Select Currency", {
    required: true,
    dropdown: CURRENCY_OPTIONS,
  });

  // ─── Section 7: CONTACTS (rows 48–54) ───
  sectionHeaderRange(sheet, 48, "CONTACTS", 6);
  noteRow(
    sheet,
    49,
    "Add additional contacts after the form is uploaded via the system.",
    6
  );

  const contactsHeaders = [
    "First Name *",
    "Last Name *",
    "Type",
    "Role *",
    "Email *",
    "Phone *",
  ];
  const headerRow = sheet.getRow(50);
  contactsHeaders.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = CONTACTS_HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = VALUE_BORDER;
  });
  headerRow.height = 20;

  // 4 data rows (51–54). Type column pre-filled with the row-position
  // label; other cells are blank input cells.
  for (let i = 0; i < 4; i++) {
    const r = 51 + i;
    const row = sheet.getRow(r);
    for (let c = 1; c <= 6; c++) {
      const cell = row.getCell(c);
      if (c === 3) {
        cell.value = CONTACT_TYPE_LABELS[i];
        cell.font = { bold: true };
        cell.fill = TYPE_CELL_FILL;
      } else {
        cell.fill = VALUE_FILL;
      }
      cell.border = VALUE_BORDER;
      cell.alignment = { vertical: "middle", horizontal: "left" };
    }
    row.height = 20;
  }

  // ADDR-2: lookup data lives inline at rows 201+ (region lists for
  // INDIRECT dropdowns + late-fees table for the dynamic locked text
  // VLOOKUP). Triple-hidden (position + row.hidden + white font).
  writeHiddenLookupData(workbook, sheet, "Site Onboarding");

  // ─── Output ───
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ─── Parser helpers (duplicated from client template) ────────────────────

function normalizeLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\*/g, "").trim();
}

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
  const trimmed = result.trim();
  // CL-20: unselected dropdown still holds DROPDOWN_PLACEHOLDER —
  // strip it back to "" so it doesn't leak into form state.
  return trimmed === DROPDOWN_PLACEHOLDER ? "" : trimmed;
}

function parseBooleanCell(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  return v === "yes" || v === "true" || v === "y" || v === "1" || v === "x";
}

function cellToString(cell: Cell): string {
  const v = cell.value;
  const s = v == null ? "" : String(v).trim();
  // CL-20: strip dropdown placeholder back to "" so unselected
  // Country / Province / Yes-No / payment dropdowns don't leak the
  // placeholder text into downstream form state.
  return s === DROPDOWN_PLACEHOLDER ? "" : s;
}

function scanContactsTable(sheet: Worksheet): ParsedContact[] {
  let headerRow = -1;
  for (let r = 1; r <= 60; r++) {
    const colA =
      sheet
        .getRow(r)
        .getCell(1)
        .value?.toString()
        .trim()
        .toLowerCase()
        .replace(/\s*\*\s*$/, "") ?? "";
    if (colA === "first name") {
      headerRow = r;
      break;
    }
  }
  if (headerRow === -1) return [];

  const contacts: ParsedContact[] = [];
  for (let i = 1; i <= 4; i++) {
    const row = sheet.getRow(headerRow + i);
    contacts.push({
      first_name: cellToString(row.getCell(1)),
      last_name: cellToString(row.getCell(2)),
      type_label: cellToString(row.getCell(3)),
      role: cellToString(row.getCell(4)),
      email: cellToString(row.getCell(5)),
      phone: cellToString(row.getCell(6)),
    });
  }
  return contacts;
}

function mapPaymentTermsLabel(raw: string): string {
  return PAYMENT_TERMS_LABEL_TO_VALUE[raw.trim().toLowerCase()] ?? "";
}

function mapPaymentMethodLabel(raw: string): string {
  return PAYMENT_METHOD_LABEL_TO_VALUE[raw.trim().toLowerCase()] ?? "";
}

// ─── Parser ────────────────────────────────────────────────────────────────

/**
 * Parse a filled Site Form template back into structured data. Lenient
 * by design — unknown / blank values pass through as empty strings or
 * null; the form's own validation catches issues on submit.
 *
 * Cross-template uploads (Client Form into the site flow, or vice
 * versa) fail the workbook.subject gate with a friendly error message.
 */
export async function parseSiteTemplate(
  file: File
): Promise<ParsedSiteTemplate> {
  const ExcelJS = await import("exceljs");
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  // Version stamp gate — workbook.subject must match this template
  // family's stamp. Client Form templates carry "nexvelon-onboarding-
  // v3" and fail here.
  const subject = workbook.subject ?? "";
  if (!subject.includes(VERSION_STAMP_VALUE)) {
    throw new Error(
      "This template appears to be from an older version or is a different template type. Please download a fresh Site Form template using the 'Download template' button."
    );
  }

  const sheet = workbook.getWorksheet("Site Onboarding");
  if (!sheet) {
    throw new Error(
      "Could not find the Site Onboarding sheet in the uploaded file."
    );
  }

  // Site Info (unique label, label-scan).
  const siteName = findValueByLabel(sheet, "Site/Project Name");

  // Site Address, Billing, Mailing labels all use "Country" / "Province
  // / State" / "Street" / "Unit / Suite" / "City" / "Postal Code" — they
  // collide under label-scan, so use absolute row-number reads per the
  // layout in generateSiteTemplate.
  // ADDR-1 layout: Country / Province / Street / Unit / City / Postal.
  const siteAddress = {
    country: cellToString(sheet.getRow(9).getCell(2)),
    province: cellToString(sheet.getRow(10).getCell(2)),
    address_line1: cellToString(sheet.getRow(11).getCell(2)),
    address_line2: cellToString(sheet.getRow(12).getCell(2)),
    city: cellToString(sheet.getRow(13).getCell(2)),
    postal_code: cellToString(sheet.getRow(14).getCell(2)),
  };
  const billing = {
    country: cellToString(sheet.getRow(17).getCell(2)),
    province: cellToString(sheet.getRow(18).getCell(2)),
    street: cellToString(sheet.getRow(19).getCell(2)),
    unit: cellToString(sheet.getRow(20).getCell(2)),
    city: cellToString(sheet.getRow(21).getCell(2)),
    postal: cellToString(sheet.getRow(22).getCell(2)),
  };
  const mailing = {
    country: cellToString(sheet.getRow(26).getCell(2)),
    province: cellToString(sheet.getRow(27).getCell(2)),
    street: cellToString(sheet.getRow(28).getCell(2)),
    unit: cellToString(sheet.getRow(29).getCell(2)),
    city: cellToString(sheet.getRow(30).getCell(2)),
    postal: cellToString(sheet.getRow(31).getCell(2)),
  };

  // Tax labels are unique to their section — label-scan is fine.
  const tax = {
    hst_gst_number: findValueByLabel(sheet, "HST / GST Number"),
    tax_exempt: parseBooleanCell(findValueByLabel(sheet, "Tax Exempt?")),
    tax_exempt_cert: findValueByLabel(
      sheet,
      "If Tax Exempt, Enter Certificate Number"
    ),
  };

  // Payment labels unique.
  const payment = {
    terms: mapPaymentTermsLabel(findValueByLabel(sheet, "Select Payment Terms")),
    method: mapPaymentMethodLabel(
      findValueByLabel(sheet, "Select Payment Method")
    ),
    currency: findValueByLabel(sheet, "Select Currency"),
  };

  return {
    site: { name: siteName, ...siteAddress },
    billing,
    mailing,
    tax,
    payment,
    contacts: scanContactsTable(sheet),
  };
}
