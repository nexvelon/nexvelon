"use client";

// SUB-5 — the work-order (subcontractor agreement) PDF (@react-pdf/renderer).
// Mirrors PurchaseOrderDocument's brand system but deliberately plainer: this is
// an OPERATIONAL document (a scoped instruction to a sub), not a client-facing
// quote. Body is Inter (PR #306); the Nexvelon wordmark + antique-gold-on-cream
// theme match the PO. Render-to-buffer lives in lib/pdf/render-work-order.ts.
//
// LEGAL NOTE: the standard-terms block below is a MINIMAL scope/payment
// statement, NOT reviewed binding legal language. It must be reviewed by legal
// before this is relied on as a contract. We intentionally do not invent
// indemnity / insurance / dispute clauses here.

import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { format, parseISO } from "date-fns";
import "@/lib/quote-fonts";
import { getQuoteTheme, type QuoteTheme } from "@/lib/quote-themes";

const WO_THEME_SLUG = "solid_white" as const;

const money = (n: number) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

function safeDate(iso: string | null, fmt = "MMMM d, yyyy"): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), fmt);
  } catch {
    return iso;
  }
}

function addressLines(p: {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
}): string[] {
  const cityLine = [p.city, p.province].filter(Boolean).join(", ");
  const cityPostal = [cityLine, p.postal_code].filter(Boolean).join("  ");
  return [p.address_line1, p.address_line2, cityPostal || null, p.country].filter(
    (s): s is string => !!s && s.trim().length > 0
  );
}

export interface WorkOrderDocumentProps {
  wo: {
    agreement_number: string;
    title: string;
    scope_of_work: string | null;
    agreed_value: number;
    start_date: string | null;
    target_completion: string | null;
    issued_date: string; // ISO — issue timestamp or today for preview
    status: string;
    notes: string | null;
  };
  subcontractor: {
    name: string;
    contact_name: string | null;
    email: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    province: string | null;
    postal_code: string | null;
    country: string | null;
  };
  project: {
    number: string | null;
    title: string | null;
    job_label: string | null; // "Main Job" / "CO #2 — …" when job-scoped
  } | null;
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

function mutedFor(theme: QuoteTheme): string {
  return `${theme.ink}99`;
}
function ink70(theme: QuoteTheme): string {
  return `${theme.ink}B3`;
}

function createStyles(theme: QuoteTheme) {
  return StyleSheet.create({
    page: {
      fontFamily: "Inter",
      backgroundColor: theme.ambience,
      paddingHorizontal: 56,
      paddingVertical: 52,
      paddingBottom: 72,
      fontSize: 9,
      color: theme.ink,
    },
    brandRow: { alignItems: "center", marginBottom: 8 },
    brandMark: {
      fontFamily: "Cormorant Garamond",
      fontWeight: "bold",
      fontSize: 30,
      color: theme.accent,
      letterSpacing: 8,
    },
    brandSub: {
      fontFamily: "Inter",
      fontWeight: "medium",
      fontSize: 8,
      color: theme.accentMuted ?? theme.accent,
      letterSpacing: 6,
      textTransform: "uppercase",
      marginTop: 4,
    },
    rule: { borderBottomWidth: 0.6, borderBottomColor: theme.accent, marginVertical: 12 },
    headerRow: { flexDirection: "row", justifyContent: "space-between" },
    headerCol: { flex: 1, paddingRight: 12 },
    headerColRight: { width: 210, alignItems: "flex-end" },
    entityName: { fontFamily: "Cormorant Garamond", fontSize: 13, color: theme.ink, marginBottom: 3 },
    entityLine: { fontFamily: "Inter", fontSize: 7.5, color: mutedFor(theme), lineHeight: 1.5 },
    entityHst: { fontFamily: "Inter", fontSize: 7.5, fontWeight: 500, color: ink70(theme), marginTop: 4 },
    woTitle: { fontFamily: "Cormorant Garamond", fontStyle: "italic", fontSize: 28, color: theme.accent },
    woNumber: {
      fontFamily: "Inter",
      fontWeight: 500,
      fontSize: 11,
      color: theme.ink,
      letterSpacing: 0.5,
      marginTop: 2,
    },
    dateRow: { marginTop: 10, alignItems: "flex-end" },
    dateLabel: {
      fontFamily: "Inter",
      fontSize: 6.5,
      color: theme.accent,
      letterSpacing: 1.5,
      textTransform: "uppercase",
    },
    dateValue: { fontFamily: "Cormorant Garamond", fontSize: 11, color: theme.ink, marginBottom: 4 },
    partiesRow: { flexDirection: "row", marginTop: 4, marginBottom: 6 },
    partyCol: { flex: 1, paddingRight: 14 },
    partyLabel: {
      fontFamily: "Inter",
      fontSize: 7,
      color: theme.accent,
      letterSpacing: 2,
      textTransform: "uppercase",
      marginBottom: 4,
    },
    partyName: { fontFamily: "Cormorant Garamond", fontSize: 12, color: theme.ink, marginBottom: 2 },
    partyLine: { fontFamily: "Inter", fontSize: 8, color: mutedFor(theme), lineHeight: 1.5 },
    attnLine: { fontFamily: "Inter", fontSize: 8, color: ink70(theme), marginTop: 2 },

    sectionLabel: {
      fontFamily: "Inter",
      fontSize: 7,
      color: theme.accent,
      letterSpacing: 2,
      textTransform: "uppercase",
      marginBottom: 4,
      marginTop: 12,
    },
    scopeTitle: { fontFamily: "Cormorant Garamond", fontSize: 13, color: theme.ink, marginBottom: 4 },
    bodyText: { fontFamily: "Inter", fontSize: 9, color: ink70(theme), lineHeight: 1.6 },

    metaGrid: { flexDirection: "row", marginTop: 12, borderTopWidth: 0.6, borderTopColor: theme.accent, paddingTop: 10 },
    metaCol: { flex: 1 },
    metaLabel: {
      fontFamily: "Inter",
      fontSize: 6.5,
      color: theme.accent,
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    metaValue: { fontFamily: "Inter", fontSize: 9.5, color: theme.ink, marginTop: 2 },
    valueBig: { fontFamily: "Cormorant Garamond", fontSize: 22, color: theme.accent, marginTop: 1 },

    termsBlock: { marginTop: 20, borderTopWidth: 0.6, borderTopColor: `${theme.accent}55`, paddingTop: 10 },
    termsText: { fontFamily: "Inter", fontSize: 7.5, color: mutedFor(theme), lineHeight: 1.6 },

    footer: { position: "absolute", bottom: 30, left: 56, right: 56 },
    footerLegal: {
      fontFamily: "Inter",
      fontSize: 6.5,
      color: theme.accent,
      letterSpacing: 0.8,
      textAlign: "center",
    },
    footerContact: { fontFamily: "Inter", fontSize: 6.5, color: mutedFor(theme), textAlign: "center", marginTop: 3 },
    pageNo: {
      position: "absolute",
      bottom: 30,
      right: 56,
      fontFamily: "Inter",
      fontSize: 6.5,
      color: mutedFor(theme),
    },
  });
}

export function WorkOrderDocument({ wo, subcontractor, project, opco }: WorkOrderDocumentProps) {
  const theme = getQuoteTheme(WO_THEME_SLUG);
  const styles = createStyles(theme);

  const opcoAddr = addressLines(opco);
  const subAddr = addressLines(subcontractor);

  return (
    <Document title={`Work Order ${wo.agreement_number}`} author={opco.legal_name}>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.brandRow}>
          <Text style={styles.brandMark}>NEXVELON</Text>
          <Text style={styles.brandSub}>GLOBAL</Text>
        </View>
        <View style={styles.rule} />

        {/* Header: issuing entity + WO title block */}
        <View style={styles.headerRow}>
          <View style={styles.headerCol}>
            <Text style={styles.entityName}>{opco.legal_name}</Text>
            {opcoAddr.map((line, i) => (
              <Text style={styles.entityLine} key={i}>
                {line}
              </Text>
            ))}
            {opco.phone ? <Text style={styles.entityLine}>{opco.phone}</Text> : null}
            {opco.email ? <Text style={styles.entityLine}>{opco.email}</Text> : null}
            <Text style={styles.entityHst}>HST/GST {opco.hst_number}</Text>
          </View>

          <View style={styles.headerColRight}>
            <Text style={styles.woTitle}>Work Order</Text>
            <Text style={styles.woNumber}>{wo.agreement_number}</Text>
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Issued</Text>
              <Text style={styles.dateValue}>{safeDate(wo.issued_date)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.rule} />

        {/* Subcontractor + project reference */}
        <View style={styles.partiesRow}>
          <View style={styles.partyCol}>
            <Text style={styles.partyLabel}>Subcontractor</Text>
            <Text style={styles.partyName}>{subcontractor.name || "—"}</Text>
            {subAddr.map((line, i) => (
              <Text style={styles.partyLine} key={i}>
                {line}
              </Text>
            ))}
            {subcontractor.contact_name ? (
              <Text style={styles.attnLine}>Attn: {subcontractor.contact_name}</Text>
            ) : null}
            {subcontractor.email ? <Text style={styles.partyLine}>{subcontractor.email}</Text> : null}
          </View>

          <View style={styles.partyCol}>
            <Text style={styles.partyLabel}>Project reference</Text>
            {project ? (
              <>
                <Text style={styles.partyName}>{project.number ?? "—"}</Text>
                {project.title ? <Text style={styles.partyLine}>{project.title}</Text> : null}
                {project.job_label ? <Text style={styles.attnLine}>{project.job_label}</Text> : null}
              </>
            ) : (
              <Text style={styles.partyLine}>No project — general engagement.</Text>
            )}
          </View>
        </View>

        {/* Scope of work */}
        <Text style={styles.sectionLabel}>Scope of work</Text>
        <Text style={styles.scopeTitle}>{wo.title}</Text>
        <Text style={styles.bodyText}>{wo.scope_of_work || "See attached / as directed on site."}</Text>

        {/* Value + schedule */}
        <View style={styles.metaGrid}>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Agreed value</Text>
            <Text style={styles.valueBig}>{money(Number(wo.agreed_value))}</Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Start</Text>
            <Text style={styles.metaValue}>{safeDate(wo.start_date)}</Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Target completion</Text>
            <Text style={styles.metaValue}>{safeDate(wo.target_completion)}</Text>
          </View>
        </View>

        {wo.notes ? (
          <>
            <Text style={styles.sectionLabel}>Notes</Text>
            <Text style={styles.bodyText}>{wo.notes}</Text>
          </>
        ) : null}

        {/* Minimal standard terms — NOT legal-reviewed (see file header). */}
        <View style={styles.termsBlock}>
          <Text style={styles.sectionLabel}>Standard terms</Text>
          <Text style={styles.termsText}>
            This work order authorizes the subcontractor named above to perform
            the scope of work described, for the agreed value shown, on the
            schedule indicated. The subcontractor must maintain current WSIB
            clearance and liability insurance for the duration of the work.
            Payment is subject to satisfactory completion and the terms of any
            master subcontract agreement between the parties. This document is
            an operational work order and does not, on its own, constitute the
            complete contract between the parties.
          </Text>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerLegal}>
            {opco.legal_name.toUpperCase()} — HST/GST {opco.hst_number}
          </Text>
          <Text style={styles.footerContact}>
            {[opco.phone, opco.email].filter(Boolean).join("  ·  ")}
          </Text>
        </View>
        <Text
          style={styles.pageNo}
          fixed
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </Page>
    </Document>
  );
}
