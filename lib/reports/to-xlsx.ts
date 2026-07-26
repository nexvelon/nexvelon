import "server-only";

// REP-1 — xlsx renderer, mirroring the server-side exceljs pattern the
// import-template generators use (dynamic import keeps the ~1MB lib out of the
// main bundle). Title band + meta + bold header + rows + bold totals. Cells
// carry the SAME formatted strings as the CSV/PDF (via formatCell) so a report
// reads identically in every format; the precomputed totals row keeps the numbers
// truthful without relying on Excel to re-sum. Returns base64 for the action
// payload (same in-payload delivery as the CSV — no signed URL for v1).

import {
  defaultAlign,
  formatCell,
  type ReportDataset,
} from "@/lib/reports/dataset";

export async function datasetToXlsxBase64(ds: ReportDataset): Promise<string> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Nexvelon";
  const sheet = wb.addWorksheet(ds.title.slice(0, 31) || "Report");
  const nCols = ds.columns.length;

  let r = 1;
  // Title band
  sheet.mergeCells(r, 1, r, Math.max(1, nCols));
  const titleCell = sheet.getCell(r, 1);
  titleCell.value = ds.title;
  titleCell.font = { bold: true, size: 14 };
  r += 1;
  if (ds.subtitle) {
    sheet.mergeCells(r, 1, r, Math.max(1, nCols));
    sheet.getCell(r, 1).value = ds.subtitle;
    sheet.getCell(r, 1).font = { italic: true, color: { argb: "FF666666" } };
    r += 1;
  }
  for (const m of ds.meta ?? []) {
    sheet.getCell(r, 1).value = `${m.label}: ${m.value}`;
    sheet.getCell(r, 1).font = { color: { argb: "FF666666" }, size: 10 };
    r += 1;
  }
  r += 1; // blank spacer

  // Header row
  const headerRow = sheet.getRow(r);
  ds.columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.label;
    cell.font = { bold: true };
    cell.alignment = { horizontal: defaultAlign(c) };
  });
  r += 1;

  // Data rows
  for (const row of ds.rows) {
    const dr = sheet.getRow(r);
    ds.columns.forEach((c, i) => {
      const cell = dr.getCell(i + 1);
      cell.value = formatCell(row[c.key], c.kind);
      cell.alignment = { horizontal: defaultAlign(c) };
    });
    r += 1;
  }

  // Totals row
  if (ds.totals) {
    const tr = sheet.getRow(r);
    ds.columns.forEach((c, i) => {
      const cell = tr.getCell(i + 1);
      cell.value = formatCell(ds.totals![c.key] ?? "", c.kind);
      cell.font = { bold: true };
      cell.alignment = { horizontal: defaultAlign(c) };
    });
  }

  // Column widths from label + sampled content.
  ds.columns.forEach((c, i) => {
    const sample = ds.rows.slice(0, 30).map((row) => formatCell(row[c.key], c.kind).length);
    sheet.getColumn(i + 1).width = Math.min(48, Math.max(12, c.label.length + 2, ...sample));
  });

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer).toString("base64");
}
