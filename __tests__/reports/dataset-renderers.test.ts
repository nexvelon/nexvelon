// REP-1 — the three renderers share ONE formatter (formatCell), so a report
// reads identically as CSV, xlsx and PDF. CSV structure + RFC-4180 quoting; xlsx
// round-trips through exceljs; PDF renders to a non-empty buffer (smoke);
// consistency: the same dataset → CSV and xlsx show identical formatted values.

import { describe, it, expect } from "vitest";
import { formatCell, type ReportDataset } from "@/lib/reports/dataset";
import { datasetToCsv } from "@/lib/reports/to-csv";
import { datasetToXlsxBase64 } from "@/lib/reports/to-xlsx";
import { datasetToPdfBase64 } from "@/lib/reports/to-pdf";

const DS: ReportDataset = {
  title: "Test Report",
  columns: [
    { key: "name", label: "Name", kind: "text" },
    { key: "amount", label: "Amount", kind: "currency" },
    { key: "rate", label: "Rate", kind: "percent" },
    { key: "when", label: "When", kind: "date" },
  ],
  rows: [
    { name: "Acme, Inc.", amount: 1234.5, rate: 12.3, when: "2026-07-25" },
    { name: 'Quote "A"', amount: -50, rate: 0, when: null },
  ],
  totals: { name: "Total", amount: 1184.5, rate: null, when: null },
  filename: "test-report",
};

describe("formatCell", () => {
  it("formats each kind", () => {
    expect(formatCell(1234.5, "currency")).toBe("$1,234.50");
    expect(formatCell(12.3, "percent")).toBe("12.3%");
    expect(formatCell("2026-07-25", "date")).toBe("25 Jul 2026");
    expect(formatCell(null, "currency")).toBe("");
    expect(formatCell("plain", "text")).toBe("plain");
  });
});

describe("datasetToCsv", () => {
  it("emits header + rows + totals with RFC-4180 quoting", () => {
    const csv = datasetToCsv(DS);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe("Name,Amount,Rate,When");
    // currency/percent/date formatted; comma + quote quoted
    expect(lines[1]).toBe('"Acme, Inc.","$1,234.50",12.3%,25 Jul 2026');
    expect(lines[2]).toBe('"Quote ""A""",-$50.00,0.0%,'); // negative currency, null date → empty
    expect(lines[3]).toBe("Total,\"$1,184.50\",,"); // totals row
  });
});

describe("datasetToXlsxBase64", () => {
  it("round-trips: title + header + typed cell values", async () => {
    const b64 = await datasetToXlsxBase64(DS);
    expect(b64.length).toBeGreaterThan(0);
    const ExcelJS = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(b64, "base64") as never);
    const sheet = wb.worksheets[0];
    expect(sheet.getCell(1, 1).value).toBe("Test Report"); // title band
    // no subtitle/meta → header at row 3, data at row 4
    expect(sheet.getCell(3, 1).value).toBe("Name");
    expect(sheet.getCell(4, 2).value).toBe("$1,234.50"); // same formatCell string as CSV
    expect(sheet.getCell(4, 3).value).toBe("12.3%");
  });
});

describe("datasetToPdfBase64", () => {
  it("renders a non-empty PDF (smoke)", async () => {
    const b64 = await datasetToPdfBase64(DS);
    expect(b64.length).toBeGreaterThan(100);
    // %PDF header → base64 starts with "JVBER"
    expect(b64.startsWith("JVBER")).toBe(true);
  }, 20_000);
});

describe("consistency: CSV and xlsx show identical formatted values", () => {
  it("currency, percent and date match across formats (via formatCell)", async () => {
    // formatCell is the single source of truth for both renderers.
    const cur = formatCell(1234.5, "currency"); // "$1,234.50"
    const pct = formatCell(12.3, "percent"); // "12.3%"
    const dat = formatCell("2026-07-25", "date"); // "25 Jul 2026"

    const csv = datasetToCsv(DS);
    // Every formatted value appears verbatim in the CSV.
    expect(csv).toContain(pct);
    expect(csv).toContain(dat);
    expect(csv).toContain('"$1,234.50"'); // quoted because of its comma

    const ExcelJS = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await datasetToXlsxBase64(DS), "base64") as never);
    const sheet = wb.worksheets[0]; // data row 4: currency col2, percent col3, date col4
    expect(sheet.getCell(4, 2).value).toBe(cur);
    expect(sheet.getCell(4, 3).value).toBe(pct);
    expect(sheet.getCell(4, 4).value).toBe(dat);
  });
});
