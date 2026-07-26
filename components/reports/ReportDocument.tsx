// REP-1 — the GENERIC tabular report PDF (title band + meta + repeating column
// header + rows + totals + page numbers), unlike the existing single-record
// invoice/PO Documents. Uses @react-pdf's built-in Helvetica (no font
// registration — quote-fonts auto-registers only in the browser, so relying on
// it server-side is fragile). Brand colours (navy / gold / cream) keep the house
// look. Rendered to a Buffer by lib/reports/to-pdf.tsx.

import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { defaultAlign, formatCell, type ReportDataset } from "@/lib/reports/dataset";

const NAVY = "#0B1B3B";
const GOLD = "#C9A24B";
const INK = "#1f2937";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 48, paddingHorizontal: 36, fontSize: 8.5, color: INK, fontFamily: "Helvetica" },
  title: { fontSize: 16, color: NAVY, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 9, color: MUTED, marginTop: 2 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 6 },
  metaItem: { fontSize: 8, color: MUTED },
  rule: { height: 2, backgroundColor: GOLD, marginTop: 8, marginBottom: 10 },
  headerRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: NAVY, paddingBottom: 3, marginBottom: 2 },
  headerCell: { fontSize: 7.5, color: NAVY, fontFamily: "Helvetica-Bold", textTransform: "uppercase", paddingHorizontal: 3 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 3 },
  cell: { fontSize: 8.5, paddingHorizontal: 3 },
  totalsRow: { flexDirection: "row", borderTopWidth: 1.5, borderTopColor: NAVY, marginTop: 2, paddingTop: 4 },
  totalsCell: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: NAVY, paddingHorizontal: 3 },
  footer: { position: "absolute", bottom: 22, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 7, color: MUTED },
  empty: { fontSize: 9, color: MUTED, fontStyle: "italic", marginTop: 12 },
});

function alignStyle(a: "left" | "right" | "center") {
  return { textAlign: a as "left" | "right" | "center" };
}

export function ReportDocument({ dataset }: { dataset: ReportDataset }) {
  const cols = dataset.columns;
  return (
    <Document title={dataset.title}>
      <Page size="A4" orientation={cols.length > 6 ? "landscape" : "portrait"} style={s.page}>
        <Text style={s.title}>{dataset.title}</Text>
        {dataset.subtitle ? <Text style={s.subtitle}>{dataset.subtitle}</Text> : null}
        {dataset.meta && dataset.meta.length > 0 ? (
          <View style={s.metaRow}>
            {dataset.meta.map((m) => (
              <Text key={m.label} style={s.metaItem}>
                {m.label}: {m.value}
              </Text>
            ))}
          </View>
        ) : null}
        <View style={s.rule} />

        {/* Header (repeats on every page) */}
        <View style={s.headerRow} fixed>
          {cols.map((c) => (
            <Text key={c.key} style={[s.headerCell, { flex: 1 }, alignStyle(defaultAlign(c))]}>
              {c.label}
            </Text>
          ))}
        </View>

        {dataset.rows.length === 0 ? (
          <Text style={s.empty}>No data for this report.</Text>
        ) : (
          dataset.rows.map((row, ri) => (
            <View key={ri} style={s.row} wrap={false}>
              {cols.map((c) => (
                <Text key={c.key} style={[s.cell, { flex: 1 }, alignStyle(defaultAlign(c))]}>
                  {formatCell(row[c.key], c.kind)}
                </Text>
              ))}
            </View>
          ))
        )}

        {dataset.totals ? (
          <View style={s.totalsRow} wrap={false}>
            {cols.map((c) => (
              <Text key={c.key} style={[s.totalsCell, { flex: 1 }, alignStyle(defaultAlign(c))]}>
                {formatCell(dataset.totals![c.key] ?? "", c.kind)}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={s.footer} fixed>
          <Text style={s.footerText}>Nexvelon · {dataset.title}</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
