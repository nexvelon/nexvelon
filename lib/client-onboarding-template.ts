"use client";

import type { Cell, Worksheet } from "exceljs";
import {
  COUNTRIES,
  PROVINCES_BY_COUNTRY,
  PROVINCE_LIST_NAME_BY_COUNTRY,
} from "./countries";
import { LATE_PAYMENT_RATES_BY_COUNTRY } from "./late-payment-rates";

// CL-10 — single-sheet client onboarding Excel template (v2).
//
// Replaces the CL-8 v1 layout. Differences from CL-8:
//   * Title carries "— v2" version stamp; parser uses it to reject old
//     templates with a friendly download-fresh-copy error.
//   * Client Info: drops Status + Industry (operator-only fields).
//   * Billing + Mailing: drops Province="ON" / Country="Canada" defaults
//     (clients shouldn't see pre-filled location hints).
//   * Payment Terms: 4 options only (Due on receipt / NET 7 / NET 15 /
//     NET 30); drops Credit Limit row; labels prefixed "Select " for
//     clarity. NO pre-filled defaults across the section.
//   * NEW locked-looking late-payment / interest text block under
//     the payment section (visual-only — italic gray fill, NOT
//     cell.protection which would lock every input cell too).
//   * Drops Portal Access + Notes sections entirely.
//   * Contacts: 4 fixed rows with a pre-filled Type column (Primary
//     Contact Work / Primary Contact Personal / AP work/ext / AP direct).
//     The 5 boolean type columns (Primary/Billing/Emergency/AP/Custom
//     Type) are gone — type intent is positional.
//   * Mandatory fields marked with " *" suffix on labels.
//
// exceljs is dynamic-imported in each function so the ~1 MB lib stays
// out of the main bundle. `import type` above is erased at compile.

// ─── Public types ──────────────────────────────────────────────────────────

export interface ParsedContact {
  first_name: string;
  last_name: string;
  /** Pre-filled Type column value (e.g. "Primary Contact Work"). The
   *  parser returns it verbatim; the merge logic in ClientForm uses it
   *  to derive the row's intent + the phone label. */
  type_label: string;
  role: string; // maps to DbContact.title; client may type their own
  email: string;
  phone: string;
  // Note: the 5 type booleans (is_primary / is_billing / is_emergency /
  // is_accounts_payable / contact_type_custom) are no longer parser-side.
  // ClientForm's handleUploadTemplate derives them from row position
  // (rows 1+2 → primary, rows 3+4 → billing+AP).
}

export interface ParsedClientTemplate {
  client: {
    legal_name: string;
    name: string;
    hst_gst_number: string;
    tax_exempt: boolean | null;
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
    terms: string; // "due_on_receipt" | "net_7" | "net_15" | "net_30" | ""
    // CL-12: terms_custom dropped — Custom Terms row removed from the
    // template. ClientForm keeps its own paymentTermsCustom state for
    // operator-side manual override on payment_terms='custom'.
    method: string; // "cheque" | "eft" | "credit_card" | "e_transfer" | "wire" | "cash" | ""
    currency: string; // "CAD" | "USD" | ""
  };
  // CL-10 dropped: client.status, client.industry, payment.credit_limit,
  // portal.{enabled,email}, notes.
  contacts: ParsedContact[]; // exactly 4 rows from the template (some may be empty)
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
const TYPE_CELL_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEFEFEF" },
} as const;
// CL-11: locked text block restyled — white background + bold black
// 11pt text (was light-gray + italic dark-gray 10pt). Kept as a
// constant so the cell wiring below stays readable.
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
// dropdowns sourced from a hidden Lists sheet (see generateClientTemplate
// for the named-range setup). Country cells use COUNTRIES; province
// cells use formula validation referencing the named ranges.
// CL-20: COUNTRY_DROPDOWN constant removed — applyCountryDropdown now
// builds the formula inline so it can prepend DROPDOWN_PLACEHOLDER.
const YES_NO_OPTIONS = ["Yes", "No"];

// CL-10: 4 options only (was 7 in CL-8). "Custom" dropped intentionally.
const PAYMENT_TERMS_LABELS = ["Due on receipt", "NET 7", "NET 15", "NET 30"];
// CL-11: reordered + dropped "Cheque" + added "Cash". Order matches
// what ClientForm/SiteForm render in the in-app dropdown so the
// download → fill → upload UX is consistent.
const PAYMENT_METHOD_LABELS = [
  "EFT",
  "e-Transfer",
  "Wire",
  "Credit Card",
  "Cash",
];
// CL-20: expanded to 5 currencies — mirrors DbClientCurrency union +
// the CHECK constraint set by migration 0020.
const CURRENCY_OPTIONS = ["CAD", "USD", "AED", "INR", "EUR"];

// CL-20: placeholder text rendered into every dropdown cell's default
// value AND injected as the first item in each dropdown's allow-list
// (so Excel doesn't flag a validation error against the placeholder).
// The parser strips this string back to "" on read — see
// findValueByLabel + cellToString.
const DROPDOWN_PLACEHOLDER = "- - - Select from dropdown - - -";

// Label → enum value maps (used by parser to round-trip dropdown
// selections back to DB enum strings).
const PAYMENT_TERMS_LABEL_TO_VALUE: Record<string, string> = {
  "due on receipt": "due_on_receipt",
  "net 7": "net_7",
  "net 15": "net_15",
  "net 30": "net_30",
};
// Lowercase keys — the parser calls `raw.trim().toLowerCase()` before
// lookup, so "e-Transfer" / "EFT" / "Cash" all round-trip through
// "e-transfer" / "eft" / "cash". CL-11: dropped "cheque" — the new
// dropdown doesn't offer it. A hand-typed "Cheque" in the Excel cell
// returns "" (unmapped) → form keeps its default. Acceptable since
// the v3 template doesn't include Cheque in the dropdown.
const PAYMENT_METHOD_LABEL_TO_VALUE: Record<string, string> = {
  eft: "eft",
  "e-transfer": "e_transfer",
  wire: "wire",
  "credit card": "credit_card",
  cash: "cash",
};

// CL-11: title is plain text again (no visible version marker). The
// version stamp moved to a hidden workbook.subject property so the
// title can read clean and "Template" was renamed to "Form" per
// operator preference. Parser checks workbook.subject — see
// VERSION_STAMP_VALUE + the gate at the top of parseClientTemplate.
// CL-12: dropped the "Nexvelon" prefix — client-facing document
// doesn't need to repeat the vendor name (it's already in the email
// signature / cover letter that ships the form).
// CL-17: final rename to "Client Form" (was "Client Template").
// Filename matches: "Client Form.xlsx".
const TITLE_TEXT = "Client Form";
// CL-14: extracted to a constant so the column-A auto-fit logic can
// exclude this text (it lives in a merged A:L cell, not in column A).
const SUBTITLE_TEXT =
  "Kindly complete the fields below — required fields marked with *";
const VERSION_STAMP_VALUE = "nexvelon-onboarding-v3";

// ADDR-2: PAYMENT_TERMS_AND_CONDITIONS_TEXT constant removed — the
// locked text cell now uses a dynamic Excel formula (VLOOKUP against
// the hidden LateFees range, keyed off the billing country). Per-
// country rates live in lib/late-payment-rates.ts.

// Pre-filled Type column values for the 4 contact rows. Order is fixed
// — the parser/merge logic depends on it.
const CONTACT_TYPE_LABELS = [
  "Primary Contact Work",
  "Primary Contact Personal",
  "AP work/ext",
  "AP direct",
] as const;

// ─── Generator helpers ─────────────────────────────────────────────────────

function sectionHeader(sheet: Worksheet, rowNum: number, title: string) {
  // Section header for the standard label/value sections (cols A:B).
  const row = sheet.getRow(rowNum);
  row.getCell(1).value = title;
  // CL-12: black on gold (was white). Higher contrast + more readable.
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
  // Wider section header for Contacts (cols A:F = 6 cols).
  const row = sheet.getRow(rowNum);
  row.getCell(1).value = title;
  // CL-12: black on gold (was white). Higher contrast + more readable.
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
  // CL-10: defaults dropped. All value cells start blank; clients fill
  // them in. The * suffix marks mandatory fields visually.
  // CL-20: dropdown cells pre-fill with DROPDOWN_PLACEHOLDER + include
  // it as the first item in the validation list, so the cell shows
  // "- - - Select from dropdown - - -" before the client picks and
  // Excel doesn't flag a validation error against the placeholder.
  // Parser strips placeholder values back to "" on read.
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
    // XLSX-FIX-1: center the placeholder dropdown cell horizontally; keep the
    // existing vertical-middle + wrapText. Dropdown cells only (free-text value
    // cells in the else branch stay left-aligned).
    row.getCell(2).alignment = {
      vertical: "middle",
      wrapText: true,
      horizontal: "center",
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

/** Apply a static 5-option Country dropdown to the given cell.
 *  CL-20: the cell is pre-filled with DROPDOWN_PLACEHOLDER and the
 *  placeholder is injected as the first item in the validation list so
 *  Excel doesn't flag it as invalid. Parser strips it back to "". */
function applyCountryDropdown(cell: Cell) {
  cell.value = DROPDOWN_PLACEHOLDER;
  cell.dataValidation = {
    type: "list",
    allowBlank: true,
    formulae: [`"${[DROPDOWN_PLACEHOLDER, ...COUNTRIES].join(",")}"`],
    showErrorMessage: false,
  };
  // XLSX-FIX-1: center the placeholder horizontally, preserving the cell's
  // existing vertical-middle + wrapText alignment from labelValueRow.
  cell.alignment = { ...cell.alignment, horizontal: "center" };
}

/**
 * Apply a dependent Province / State dropdown to `cell` whose options
 * are sourced from the named range matching the country in `countryCellRef`.
 * The INDIRECT formula resolves "Canada" → "Canada_Regions" via the
 * uniform `_Regions` suffix (see PROVINCE_LIST_NAME_BY_COUNTRY in
 * lib/countries.ts). Works in Excel, LibreOffice, and Google Sheets.
 *
 * CL-20: the cell is pre-filled with DROPDOWN_PLACEHOLDER. The
 * placeholder is also written as the first row of each region's hidden
 * lookup column (see writeHiddenLookupData) so it appears as the first
 * item in every per-country province dropdown. Parser strips it back
 * to "".
 */
function applyProvinceIndirectDropdown(cell: Cell, countryCellRef: string) {
  cell.value = DROPDOWN_PLACEHOLDER;
  cell.dataValidation = {
    type: "list",
    allowBlank: true,
    formulae: [`=INDIRECT(${countryCellRef} & "_Regions")`],
    showErrorMessage: false,
  };
  // XLSX-FIX-1: center the placeholder horizontally, preserving the cell's
  // existing vertical-middle + wrapText alignment from labelValueRow.
  cell.alignment = { ...cell.alignment, horizontal: "center" };
}

/**
 * Build the hidden Lists sheet + define one named range per country
 * (Canada_Regions / USA_Regions / UAE_Regions / India_Regions /
 * Ireland_Regions). The province cells' INDIRECT formula resolves
 * against these names at sheet-evaluation time.
 */
/**
 * ADDR-2: row index where the hidden region-lookup data starts. Sits
 * far below the form content (which ends around row 50) so even an
 * accidentally un-hidden block doesn't pollute the visible area.
 */
const HIDDEN_DATA_START_ROW = 201;
/**
 * CL-20: late-fees table starts dynamically below the longest region
 * column. Region columns now include a DROPDOWN_PLACEHOLDER row at
 * position 0 (so it appears as the first item in every per-country
 * province dropdown via the named-range INDIRECT lookup), so the
 * effective max region row count is `maxProvinces + 1`. An extra 8-row
 * buffer keeps things future-proof if a country adds states/provinces.
 */
const MAX_PROVINCE_COUNT = Math.max(
  ...COUNTRIES.map((c) => PROVINCES_BY_COUNTRY[c].length)
);
const LATE_FEES_START_ROW =
  HIDDEN_DATA_START_ROW + MAX_PROVINCE_COUNT + 1 + 8;

/**
 * ADDR-2: write the hidden lookup data INLINE on the main form sheet
 * (instead of a separate "Lists" tab, which appeared in the bottom
 * tab strip and looked unprofessional for a client-facing template).
 *
 * Three layers of hiding stack defensively:
 *   1. Position — rows 200+ are far below the form content.
 *   2. row.hidden = true — Excel collapses the rows.
 *   3. white font on default-white background — invisible even if a
 *      curious user manually un-hides the rows.
 *
 * The named ranges (Canada_Regions / USA_Regions / UAE_Regions /
 * India_Regions / Ireland_Regions + LateFees) are defined here so the
 * Province INDIRECT dropdowns + the locked-text VLOOKUP formula
 * resolve correctly against the main sheet.
 *
 * `sheetName` must match the worksheet that owns these rows — passed
 * in by the caller so this helper stays sheet-name-agnostic.
 */
function writeHiddenLookupData(
  workbook: import("exceljs").Workbook,
  sheet: Worksheet,
  sheetName: string
) {
  const colLetters = ["A", "B", "C", "D", "E"];
  const whiteFont = { color: { argb: "FFFFFFFF" } } as const;

  // ── Region lookup (cols A–E, one column per country) ──
  // CL-20: prepend DROPDOWN_PLACEHOLDER as row 0 of every region column
  // so it appears as the first item in every per-country province
  // dropdown (the INDIRECT formula picks the column's named range whole,
  // including the placeholder row). Parser strips placeholder back to "".
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

  // ── Named range per country pointing at the main sheet's bottom rows ──
  // Sheet name is quoted so spaces (e.g. "Client Onboarding") work.
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

  // ── Late-fees lookup table (cols A–D, one row per country) ──
  // Col A: country name (VLOOKUP key)
  // Col B: monthly interest %
  // Col C: annual interest %
  // Col D: credit-card surcharge %
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

  // ── Hide every row in the lookup band ──
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
 * CL-10: generate the single-sheet onboarding Excel template (v2).
 * Returns a Blob downloadable via URL.createObjectURL.
 */
export async function generateClientTemplate(): Promise<Blob> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Nexvelon";
  // CL-11: hidden version stamp. Stored as <dc:subject> in the OOXML
  // core properties; Excel preserves it on save. parseClientTemplate
  // gates uploads on this string — see the check at the top of the
  // parser. Old templates (CL-10 v2 and earlier) have no subject set
  // and fail the gate with the friendly "older version" error.
  workbook.subject = VERSION_STAMP_VALUE;
  workbook.created = new Date();

  // ADDR-2: lookup data lives on the main sheet (was a separate hidden
  // "Lists" tab in ADDR-1, which appeared in the bottom tab strip and
  // looked unprofessional). writeHiddenLookupData() is called AFTER
  // the main sheet exists; see the call near the end of this function.

  const sheet = workbook.addWorksheet("Client Onboarding");

  // Column widths — A=labels / First Name, B=values / Last Name,
  // C=Type, D=Role, E=Email, F=Phone. The late-payment block merges
  // A:L so cols G–L need some minimum width too.
  // CL-14: column 1 width is auto-fit at the end of this function
  // based on the longest label rendered into column A. See the
  // dynamic computation right before workbook.xlsx.writeBuffer().
  sheet.getColumn(2).width = 38;
  sheet.getColumn(3).width = 25;
  sheet.getColumn(4).width = 25;
  sheet.getColumn(5).width = 30;
  sheet.getColumn(6).width = 20;
  for (let c = 7; c <= 12; c++) sheet.getColumn(c).width = 8;

  // Freeze the title block so it stays visible while scrolling.
  sheet.views = [{ state: "frozen", ySplit: 3 }];

  // ─── Title block (rows 1–2) ───
  // Row 1: plain title text (no visible version marker — that lives in
  // workbook.subject now).
  sheet.getCell("A1").value = TITLE_TEXT;
  sheet.getCell("A1").font = { bold: true, size: 16 };
  sheet.getCell("A1").alignment = {
    vertical: "middle",
    horizontal: "center",
    wrapText: true,
  };
  sheet.mergeCells("A1:L1");
  // CL-12: bumped from 26 → 28 + wrapText so the 16pt bold title
  // renders cleanly without needing a manual row-height drag in Excel.
  sheet.getRow(1).height = 28;

  // Row 2: subtitle. Row 3 intentionally blank (CL-10 drops the old
  // "Download a fresh template…" line; ySplit:3 still freezes the
  // breathing-room row so the title group looks anchored).
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

  // ─── Section 1: CLIENT INFORMATION (rows 5–7) ───
  sectionHeader(sheet, 5, "CLIENT INFORMATION");
  labelValueRow(sheet, 6, "Company Legal Name", { required: true });
  // CL-12: trade name relabeled (still optional). The form's submit-
  // side fallback (`tradeName = name.trim() || legalName.trim()`)
  // handles blank.
  labelValueRow(sheet, 7, "Company's registered trade/business name");
  // CL-10: Status + Industry rows DROPPED (operator-only fields).

  // ─── Section 2: BILLING ADDRESS (rows 9–15) ───
  // ADDR-1 layout (Country first → Province dependent → Street/...):
  //   Row 10 Country, Row 11 Province, Row 12 Street, Row 13 Unit / Suite,
  //   Row 14 City, Row 15 Postal Code.
  sectionHeader(sheet, 9, "BILLING ADDRESS");
  labelValueRow(sheet, 10, "Country", { required: true });
  applyCountryDropdown(sheet.getCell("B10"));
  labelValueRow(sheet, 11, "Province / State", { required: true });
  applyProvinceIndirectDropdown(sheet.getCell("B11"), "$B$10");
  // ADDR-2: Excel can't auto-clear a dropdown cell when its dependency
  // changes (would need VBA). The hover comment nudges the operator.
  sheet.getCell("B11").note =
    "If you change Country, please re-select Province / State — the dropdown options change but the cell value does not auto-clear.";
  labelValueRow(sheet, 12, "Street", { required: true });
  labelValueRow(sheet, 13, "Unit / Suite", { required: true });
  labelValueRow(sheet, 14, "City", { required: true });
  labelValueRow(sheet, 15, "Postal Code", { required: true });

  // ─── Section 3: MAILING ADDRESS (rows 17–24) ───
  // ADDR-1: same Country-first reorder; rows 19–24 now C/P/S/U/Ci/PC.
  sectionHeader(sheet, 17, "MAILING ADDRESS");
  noteRow(
    sheet,
    18,
    "Kindly leave all fields blank if mailing address will be same as billing address"
  );
  labelValueRow(sheet, 19, "Country", { required: true });
  applyCountryDropdown(sheet.getCell("B19"));
  labelValueRow(sheet, 20, "Province / State", { required: true });
  applyProvinceIndirectDropdown(sheet.getCell("B20"), "$B$19");
  sheet.getCell("B20").note =
    "If you change Country, please re-select Province / State — the dropdown options change but the cell value does not auto-clear.";
  labelValueRow(sheet, 21, "Street", { required: true });
  labelValueRow(sheet, 22, "Unit / Suite", { required: true });
  labelValueRow(sheet, 23, "City", { required: true });
  labelValueRow(sheet, 24, "Postal Code", { required: true });

  // ─── Section 4: TAX (rows 26–29) ───
  sectionHeader(sheet, 26, "TAX");
  labelValueRow(sheet, 27, "HST / GST Number", { required: true });
  labelValueRow(sheet, 28, "Tax Exempt?", {
    required: true,
    dropdown: YES_NO_OPTIONS,
  });
  // CL-12: label rewritten for clarity (still optional — only required
  // when Tax Exempt = Yes, enforced form-side via validateClientPayload).
  labelValueRow(sheet, 29, "If Tax Exempt, Enter Certificate Number");

  // ─── Section 5: PAYMENT TERMS & METHOD (rows 31–39) ───
  // CL-13: restructured. The locked terms-and-conditions block now
  // sits IMMEDIATELY below the section header (rows 32–35), BEFORE
  // the Select Payment Terms / Method / Currency dropdowns (rows
  // 37–39). The Acknowledge field is gone entirely — Excel-only by
  // construction so dropping it leaves no DB / form-state debt.
  sectionHeader(sheet, 31, "PAYMENT TERMS & METHOD");

  // ─── Locked payment-terms-and-conditions text block (rows 32–35) ───
  // ADDR-2: text is now a DYNAMIC Excel formula that pulls per-country
  // rates from the hidden LateFees named range, keyed off the billing
  // country cell ($B$10). When the operator/client picks a billing
  // country, the locked block auto-rewrites to that country's monthly
  // interest %, annual %, and credit-card surcharge %. IFERROR fallback
  // uses Canada defaults (2.5 / 30 / 2.5) when no country is selected.
  //
  // CHAR(10) produces a hard line break — rendered as real newlines
  // thanks to wrapText: true below.
  //
  // Styling unchanged from CL-13/CL-19: bold black 11pt on white fill.
  // Visual-only locking (no cell.protection / sheet.protect).
  sheet.mergeCells("A32:L35");
  const lateCell = sheet.getCell("A32");
  lateCell.value = {
    formula:
      '="Payment terms and conditions:" & CHAR(10) & ' +
      '"1> Invoices not settled beyond the selected payment term accrues interest at a rate of " & ' +
      "IFERROR(VLOOKUP($B$10,LateFees,2,FALSE),2.5) & " +
      '"% per month (" & ' +
      "IFERROR(VLOOKUP($B$10,LateFees,3,FALSE),30) & " +
      '"% per annum) effective from that due date on all outstanding balances." & CHAR(10) & ' +
      '"2> Credit card payments will incur a " & ' +
      "IFERROR(VLOOKUP($B$10,LateFees,4,FALSE),2.5) & " +
      '"% merchant processing surcharge. To avoid this fee, you may choose to pay via EFT."',
    result: "",
  };
  lateCell.font = {
    bold: true,
    color: { argb: "FF000000" },
    size: 11,
  };
  // CL-20: vertical center (was "top") — text now sits visually
  // centered in the 4-row merged block instead of crowding at the top.
  lateCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  lateCell.fill = LOCKED_TEXT_FILL;
  lateCell.border = VALUE_BORDER;
  // 4 rows × 22pt = 88pt — accommodates the 3-line text (header +
  // 2 numbered items) with breathing room.
  for (let r = 32; r <= 35; r++) sheet.getRow(r).height = 22;

  // Row 36 left blank as a visual spacer between the locked text
  // and the dropdown rows.
  labelValueRow(sheet, 37, "Select Payment Terms", {
    required: true,
    dropdown: PAYMENT_TERMS_LABELS,
  });
  labelValueRow(sheet, 38, "Select Payment Method", {
    required: true,
    dropdown: PAYMENT_METHOD_LABELS,
  });
  labelValueRow(sheet, 39, "Select Currency", {
    required: true,
    dropdown: CURRENCY_OPTIONS,
  });

  // ─── Section 6: CONTACTS (rows 41–47) ───
  // CL-13: shifted up by 2 rows (was 43–49) — the entire Acknowledge
  // row + its spacer are gone.
  sectionHeaderRange(sheet, 41, "CONTACTS", 6);
  noteRow(
    sheet,
    42,
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
  const headerRow = sheet.getRow(43);
  contactsHeaders.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = CONTACTS_HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = VALUE_BORDER;
  });
  headerRow.height = 20;

  // 4 data rows (44–47). Type column pre-filled with the row-position
  // label; the rest are input cells (yellow fill). NO Yes/No dropdowns
  // anywhere (CL-10 dropped the 5 boolean type columns).
  for (let i = 0; i < 4; i++) {
    const r = 44 + i;
    const row = sheet.getRow(r);
    for (let c = 1; c <= 6; c++) {
      const cell = row.getCell(c);
      if (c === 3) {
        // Type column — pre-filled, distinct fill, bold.
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

  // ─── CL-17: Column A width hardcoded to 33 per operator request ───────
  // The dynamic auto-fit (CL-14 → CL-16) computed character-count widths,
  // but Excel renders width units as a function of the default font's
  // character width — so "exact fit on char count" overshot in pixels
  // and looked too wide. 33 is the visual sweet spot the operator
  // confirmed. SUBTITLE_TEXT + PAYMENT_TERMS_AND_CONDITIONS_TEXT
  // constants stay (still wire the row 2 + locked-text-block cells).
  sheet.getColumn(1).width = 35;

  // ADDR-2: lookup data lives inline on the main sheet (region lists
  // for INDIRECT province dropdowns + late-fees table for the dynamic
  // locked text VLOOKUP). Written here at the very end so the rows
  // don't push the form's column-A auto-fit logic — they're far below
  // (rows 201+) and triple-hidden (position + row.hidden + white font).
  writeHiddenLookupData(workbook, sheet, "Client Onboarding");

  // ─── Output ───
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ─── Parser helpers ────────────────────────────────────────────────────────

/** Normalize a label: lowercase, trim, strip trailing asterisks. */
function normalizeLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\*/g, "").trim();
}

/**
 * Find a value in a 2-column label/value sheet by matching the label in
 * col 1. Returns the trimmed string from col 2, or "" if not found.
 * Label-based lookup survives row insertions / reordering.
 *
 * NOTE: where labels collide between sections (Billing vs Mailing both
 * have "Street" / "City" / etc.), parseClientTemplate uses absolute
 * row-number reads instead — see the billing/mailing blocks below.
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
  const trimmed = result.trim();
  // CL-20: an unselected dropdown still holds DROPDOWN_PLACEHOLDER —
  // strip it back to "" so it doesn't leak into form state.
  return trimmed === DROPDOWN_PLACEHOLDER ? "" : trimmed;
}

/** Parse a yes/no cell into a boolean, or null when the cell is empty. */
function parseBooleanCell(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  return v === "yes" || v === "true" || v === "y" || v === "1" || v === "x";
}

function cellToString(cell: Cell): string {
  const v = cell.value;
  const s = v == null ? "" : String(v).trim();
  // CL-20: strip the dropdown placeholder back to "" so unselected
  // Country / Province / Yes-No / Payment-Terms / etc. cells don't
  // leak the placeholder text into downstream form state or DB writes.
  return s === DROPDOWN_PLACEHOLDER ? "" : s;
}

/**
 * Scan the Contacts table: find the header row (col A = "First Name"),
 * then read exactly 4 data rows below (rows 1-4 of the table). All 4
 * are returned in order — including empty rows — because the merge
 * logic in ClientForm depends on positional indexing.
 */
function scanContactsTable(sheet: Worksheet): ParsedContact[] {
  let headerRow = -1;
  for (let r = 1; r <= 60; r++) {
    const colA =
      sheet.getRow(r).getCell(1).value?.toString().trim().toLowerCase().replace(
        /\s*\*\s*$/,
        ""
      ) ?? "";
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
 * Parse a filled CL-10 v2 template back into structured data. Lenient
 * by design — unknown / blank values pass through as empty strings or
 * null; the form's own validation catches issues on submit.
 *
 * Old templates fail one of two ways:
 *   1. CL-4 (4-sheet) — no "Client Onboarding" sheet → friendly error.
 *   2. CL-8 v1 (single sheet, no version stamp) — title cell lacks
 *      "— v2" → same friendly error.
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

  // CL-11: version stamp gate via workbook.subject (hidden core
  // property). Older templates (CL-10 v2 — visible "— v2" in title,
  // no subject; CL-8 v1; CL-4) all lack the subject string and fail
  // here with the friendly "older version" message.
  const subject = workbook.subject ?? "";
  if (!subject.includes(VERSION_STAMP_VALUE)) {
    throw new Error(
      "This template appears to be from an older version. Please download a fresh template using the 'Download Template' button."
    );
  }

  // CL-13: Acknowledge hard-block removed entirely. The locked terms
  // block now sits directly under the section header, before the
  // dropdowns — the operator/client reads it inline as part of the
  // payment section. Old CL-11/CL-12 templates with the Acknowledge
  // row still upload successfully; the parser silently ignores the
  // unused field.

  const taxExemptRaw = findValueByLabel(sheet, "Tax Exempt?");

  return {
    client: {
      legal_name: findValueByLabel(sheet, "Company Legal Name"),
      // CL-11: label renamed (parser still uses normalized label-scan,
      // so the long new label is matched verbatim — case + asterisks
      // stripped by normalizeLabel).
      name: findValueByLabel(
        sheet,
        "Company's trade / registered business/brand name (if any)"
      ),
      hst_gst_number: findValueByLabel(sheet, "HST / GST Number"),
      tax_exempt: parseBooleanCell(taxExemptRaw),
      tax_exempt_cert: findValueByLabel(
        sheet,
        "If Tax Exempt, Enter Certificate Number"
      ),
    },
    // Billing + Mailing labels collide ("Street" / "City" / "Province" /
    // "Postal Code" / "Country" / "Unit / Suite" appear in BOTH sections).
    // Read those fields by absolute row number — billing rows 10-15,
    // mailing rows 19-24 per CL-10 layout. Other sections still use
    // findValueByLabel since their labels are unique.
    // ADDR-1: reordered to Country (R10) / Province (R11) / Street (R12)
    // / Unit (R13) / City (R14) / Postal (R15).
    billing: {
      country: cellToString(sheet.getRow(10).getCell(2)),
      province: cellToString(sheet.getRow(11).getCell(2)),
      street: cellToString(sheet.getRow(12).getCell(2)),
      unit: cellToString(sheet.getRow(13).getCell(2)),
      city: cellToString(sheet.getRow(14).getCell(2)),
      postal: cellToString(sheet.getRow(15).getCell(2)),
    },
    // ADDR-1: same Country-first reorder; rows 19–24.
    mailing: {
      country: cellToString(sheet.getRow(19).getCell(2)),
      province: cellToString(sheet.getRow(20).getCell(2)),
      street: cellToString(sheet.getRow(21).getCell(2)),
      unit: cellToString(sheet.getRow(22).getCell(2)),
      city: cellToString(sheet.getRow(23).getCell(2)),
      postal: cellToString(sheet.getRow(24).getCell(2)),
    },
    payment: {
      terms: mapPaymentTermsLabel(
        findValueByLabel(sheet, "Select Payment Terms")
      ),
      // CL-12: terms_custom read dropped — Custom Terms row no longer
      // in the template.
      method: mapPaymentMethodLabel(
        findValueByLabel(sheet, "Select Payment Method")
      ),
      currency: findValueByLabel(sheet, "Select Currency"),
    },
    contacts: scanContactsTable(sheet),
  };
}
