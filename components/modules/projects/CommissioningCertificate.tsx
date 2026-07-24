"use client";

// PROJ2-13 — the commissioning certificate PDF (@react-pdf/renderer). Reuses the
// SUB-5 work-order document's brand system and structure: Nexvelon wordmark +
// antique-gold-on-cream theme, opco from the project. The signature is the
// captured PNG data URL (the pickup-slip mechanism), embedded via
// React.createElement(Image) to sidestep the jsx-a11y alt-text false positive
// that lib/pdf/signed-tc-pdf and PickupSlipDocument also work around.

import React from "react";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { format, parseISO } from "date-fns";
import "@/lib/quote-fonts";
import { getQuoteTheme, type QuoteTheme } from "@/lib/quote-themes";

const THEME_SLUG = "solid_white" as const;

function safeDate(iso: string | null, fmt = "MMMM d, yyyy"): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), fmt);
  } catch {
    return iso;
  }
}

function mutedFor(theme: QuoteTheme): string {
  return `${theme.ink}99`;
}
function ink70(theme: QuoteTheme): string {
  return `${theme.ink}B3`;
}

const RESULT_LABEL: Record<string, string> = {
  pending: "Pending",
  pass: "Pass",
  fail: "Fail",
  na: "N/A",
};

export interface CommissioningCertificateProps {
  run: {
    title: string;
    performed_by: string | null;
    performed_at: string | null;
    witnessed_by: string | null;
    signer_name: string | null;
    signer_title: string | null;
    signed_off_at: string | null;
    signature_data: string | null;
    notes: string | null;
  };
  project: { number: string | null; title: string | null; job_label: string | null };
  items: {
    category: string | null;
    description: string;
    expected_result: string | null;
    result: string;
    actual_note: string | null;
  }[];
  summary: { pass: number; fail: number; na: number; total: number };
  opco: {
    legal_name: string;
    address_line1: string;
    address_line2: string | null;
    city: string;
    province: string;
    postal_code: string;
    phone: string | null;
    email: string | null;
    hst_number: string;
  };
}

function createStyles(theme: QuoteTheme) {
  return StyleSheet.create({
    page: {
      fontFamily: "Inter",
      backgroundColor: theme.ambience,
      paddingHorizontal: 52,
      paddingVertical: 48,
      paddingBottom: 72,
      fontSize: 8.5,
      color: theme.ink,
    },
    brandRow: { alignItems: "center", marginBottom: 8 },
    brandMark: {
      fontFamily: "Cormorant Garamond",
      fontWeight: "bold",
      fontSize: 28,
      color: theme.accent,
      letterSpacing: 8,
    },
    brandSub: {
      fontFamily: "Inter",
      fontWeight: "medium",
      fontSize: 7.5,
      color: theme.accentMuted ?? theme.accent,
      letterSpacing: 6,
      textTransform: "uppercase",
      marginTop: 4,
    },
    rule: { borderBottomWidth: 0.6, borderBottomColor: theme.accent, marginVertical: 10 },
    title: { fontFamily: "Cormorant Garamond", fontStyle: "italic", fontSize: 22, color: theme.accent, textAlign: "center" },
    subtitle: { fontFamily: "Inter", fontSize: 9, color: ink70(theme), textAlign: "center", marginTop: 2, marginBottom: 6 },
    metaRow: { flexDirection: "row", marginTop: 6, marginBottom: 4 },
    metaCol: { flex: 1, paddingRight: 10 },
    metaLabel: { fontFamily: "Inter", fontSize: 6.5, color: theme.accent, letterSpacing: 1.2, textTransform: "uppercase" },
    metaValue: { fontFamily: "Inter", fontSize: 9, color: theme.ink, marginTop: 1 },

    tableHead: {
      flexDirection: "row",
      paddingVertical: 5,
      borderBottomWidth: 0.6,
      borderBottomColor: theme.accent,
      marginTop: 10,
    },
    th: { fontFamily: "Inter", fontSize: 6.5, color: mutedFor(theme), letterSpacing: 0.5, textTransform: "uppercase" },
    row: {
      flexDirection: "row",
      paddingVertical: 4,
      borderBottomWidth: 0.4,
      borderBottomColor: `${theme.accent}44`,
    },
    cCat: { width: "18%", paddingRight: 4 },
    cDesc: { width: "34%", paddingRight: 4 },
    cExp: { width: "24%", paddingRight: 4 },
    cRes: { width: "10%", paddingRight: 4 },
    cNote: { width: "14%" },
    cell: { fontFamily: "Inter", fontSize: 8, color: theme.ink },
    cellMuted: { fontFamily: "Inter", fontSize: 7.5, color: mutedFor(theme) },
    resPass: { fontFamily: "Inter", fontSize: 8, fontWeight: 500, color: theme.accent },
    resFail: { fontFamily: "Inter", fontSize: 8, fontWeight: 500, color: "#B4232A" },

    summaryRow: { flexDirection: "row", gap: 16, marginTop: 12 },
    summaryChip: { fontFamily: "Inter", fontSize: 9, color: theme.ink },

    signBlock: { marginTop: 24, borderTopWidth: 0.6, borderTopColor: theme.accent, paddingTop: 12 },
    signGrid: { flexDirection: "row", gap: 24 },
    signCol: { flex: 1 },
    sigImage: { height: 56, objectFit: "contain", marginBottom: 2 },
    sigLine: { borderTopWidth: 0.6, borderTopColor: ink70(theme), paddingTop: 2, marginTop: 2 },
    sigLabel: { fontFamily: "Inter", fontSize: 6.5, color: theme.accent, letterSpacing: 1, textTransform: "uppercase" },
    sigValue: { fontFamily: "Inter", fontSize: 9, color: theme.ink },

    footer: { position: "absolute", bottom: 28, left: 52, right: 52 },
    footerLegal: { fontFamily: "Inter", fontSize: 6.5, color: theme.accent, letterSpacing: 0.8, textAlign: "center" },
  });
}

export function CommissioningCertificate({
  run,
  project,
  items,
  summary,
  opco,
}: CommissioningCertificateProps) {
  const theme = getQuoteTheme(THEME_SLUG);
  const styles = createStyles(theme);

  return (
    <Document title={`Commissioning Certificate — ${project.number ?? ""}`} author={opco.legal_name}>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.brandRow}>
          <Text style={styles.brandMark}>NEXVELON</Text>
          <Text style={styles.brandSub}>GLOBAL</Text>
        </View>
        <View style={styles.rule} />

        <Text style={styles.title}>Commissioning Certificate</Text>
        <Text style={styles.subtitle}>{run.title}</Text>

        <View style={styles.metaRow}>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Project</Text>
            <Text style={styles.metaValue}>
              {project.number ?? "—"}
              {project.title ? ` — ${project.title}` : ""}
            </Text>
            {project.job_label ? <Text style={styles.metaValue}>{project.job_label}</Text> : null}
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Performed by</Text>
            <Text style={styles.metaValue}>{run.performed_by ?? "—"}</Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Date</Text>
            <Text style={styles.metaValue}>{safeDate(run.performed_at)}</Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Witnessed by</Text>
            <Text style={styles.metaValue}>{run.witnessed_by ?? "—"}</Text>
          </View>
        </View>

        {/* Item table */}
        <View style={styles.tableHead}>
          <Text style={[styles.th, styles.cCat]}>Category</Text>
          <Text style={[styles.th, styles.cDesc]}>Test</Text>
          <Text style={[styles.th, styles.cExp]}>Expected</Text>
          <Text style={[styles.th, styles.cRes]}>Result</Text>
          <Text style={[styles.th, styles.cNote]}>Note</Text>
        </View>
        {items.length === 0 ? (
          <View style={styles.row}>
            <Text style={[styles.cell, { paddingLeft: 2 }]}>No items recorded.</Text>
          </View>
        ) : (
          items.map((it, i) => (
            <View style={styles.row} key={i} wrap={false}>
              <Text style={[styles.cellMuted, styles.cCat]}>{it.category || "—"}</Text>
              <Text style={[styles.cell, styles.cDesc]}>{it.description}</Text>
              <Text style={[styles.cellMuted, styles.cExp]}>{it.expected_result || "—"}</Text>
              <Text style={[it.result === "fail" ? styles.resFail : styles.resPass, styles.cRes]}>
                {RESULT_LABEL[it.result] ?? it.result}
              </Text>
              <Text style={[styles.cellMuted, styles.cNote]}>{it.actual_note || "—"}</Text>
            </View>
          ))
        )}

        <View style={styles.summaryRow}>
          <Text style={styles.summaryChip}>Pass: {summary.pass}</Text>
          <Text style={styles.summaryChip}>Fail: {summary.fail}</Text>
          <Text style={styles.summaryChip}>N/A: {summary.na}</Text>
          <Text style={styles.summaryChip}>Total: {summary.total}</Text>
        </View>

        {run.notes ? (
          <View style={{ marginTop: 10 }}>
            <Text style={styles.metaLabel}>Notes</Text>
            <Text style={styles.cell}>{run.notes}</Text>
          </View>
        ) : null}

        {/* Signature block */}
        <View style={styles.signBlock}>
          <View style={styles.signGrid}>
            <View style={styles.signCol}>
              {run.signature_data
                ? React.createElement(Image, { style: styles.sigImage, src: run.signature_data })
                : <View style={{ height: 56 }} />}
              <View style={styles.sigLine}>
                <Text style={styles.sigLabel}>Signature</Text>
                <Text style={styles.sigValue}>{run.signer_name ?? "—"}</Text>
                {run.signer_title ? <Text style={styles.cellMuted}>{run.signer_title}</Text> : null}
              </View>
            </View>
            <View style={styles.signCol}>
              <View style={{ height: 56 }} />
              <View style={styles.sigLine}>
                <Text style={styles.sigLabel}>Signed off</Text>
                <Text style={styles.sigValue}>{safeDate(run.signed_off_at)}</Text>
                <Text style={styles.cellMuted}>{opco.legal_name}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerLegal}>
            {opco.legal_name.toUpperCase()} — HST/GST {opco.hst_number}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
