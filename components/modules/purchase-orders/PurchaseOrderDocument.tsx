"use client";

// PO-2 — branded purchase-order PDF (@react-pdf/renderer), mirroring
// InvoiceDocument's fonts (Cormorant Garamond × Inter) and the antique-gold-on-
// cream printable house theme. POs are always issued by the opco (Nexvelon
// Integrated Solutions Inc.); the branding block is passed in via `opco`
// (assembled by buildPurchaseOrderPdfProps from company-profile). This component
// only renders — no data fetching, no rendering-to-buffer (that's PO-4).

import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { format, parseISO } from "date-fns";
import "@/lib/quote-fonts";
import { getQuoteTheme, type QuoteTheme } from "@/lib/quote-themes";

// A clean, light, antique-gold-on-cream house look for the printable PO — the
// same theme the invoice PDF uses.
const PO_THEME_SLUG = "solid_white" as const;

function mutedFor(theme: QuoteTheme): string {
  return `${theme.ink}99`; // 60% alpha
}
function ink70(theme: QuoteTheme): string {
  return `${theme.ink}B3`; // 70% alpha
}

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

// Non-empty, ordered address lines from a loosely-typed party.
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

export interface PurchaseOrderDocumentProps {
  po: {
    id: string;
    po_number: string;
    order_date: string;
    expected_date: string | null;
    ship_by_date: string | null;
    terms: string | null;
    notes: string | null;
    tax_rate: number | null; // 0.13 = 13%
    tax_amount: number | null;
    status: string;
  };
  vendor: {
    name: string;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    province: string | null;
    postal_code: string | null;
    country: string | null;
    sales_rep_name: string | null;
    sales_rep_email: string | null;
    sales_rep_phone: string | null;
    payment_terms: string | null;
  };
  shipTo: {
    kind: "office" | "site";
    name: string;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    province: string | null;
    postal_code: string | null;
  };
  lines: {
    line_no: number;
    part_number: string | null;
    description: string;
    quantity: number;
    unit_cost: number;
    lineTotal: number;
  }[];
  subtotal: number;
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
    logoUrl: string | null;
  };
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
    rule: {
      borderBottomWidth: 0.6,
      borderBottomColor: theme.accent,
      marginVertical: 12,
    },
    headerRow: { flexDirection: "row", justifyContent: "space-between" },
    headerCol: { flex: 1, paddingRight: 12 },
    headerColRight: { width: 210, alignItems: "flex-end" },
    entityName: {
      fontFamily: "Cormorant Garamond",
      fontSize: 13,
      color: theme.ink,
      marginBottom: 3,
    },
    entityLine: { fontFamily: "Inter", fontSize: 7.5, color: mutedFor(theme), lineHeight: 1.5 },
    entityHst: {
      fontFamily: "Inter",
      fontSize: 7.5,
      fontWeight: 500,
      color: ink70(theme),
      marginTop: 4,
    },
    poTitle: {
      fontFamily: "Cormorant Garamond",
      fontStyle: "italic",
      fontSize: 30,
      color: theme.accent,
    },
    poNumber: {
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
    dateValue: {
      fontFamily: "Cormorant Garamond",
      fontSize: 11,
      color: theme.ink,
      marginBottom: 4,
    },
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
    partyName: {
      fontFamily: "Cormorant Garamond",
      fontSize: 12,
      color: theme.ink,
      marginBottom: 2,
    },
    partyLine: { fontFamily: "Inter", fontSize: 8, color: mutedFor(theme), lineHeight: 1.5 },
    attnLine: { fontFamily: "Inter", fontSize: 8, color: ink70(theme), marginTop: 2 },

    tableHead: {
      flexDirection: "row",
      paddingVertical: 6,
      borderBottomWidth: 0.6,
      borderBottomColor: theme.accent,
      marginTop: 8,
    },
    th: {
      fontFamily: "Inter",
      fontSize: 7,
      color: mutedFor(theme),
      letterSpacing: 0.6,
      textTransform: "uppercase",
    },
    row: {
      flexDirection: "row",
      paddingVertical: 5,
      borderBottomWidth: 0.4,
      borderBottomColor: `${theme.accent}55`,
    },
    cNum: { width: "6%", paddingRight: 4 },
    cPart: { width: "16%", paddingRight: 6 },
    cDesc: { width: "40%", paddingRight: 6 },
    cQty: { width: "8%", textAlign: "right" },
    cUnit: { width: "14%", textAlign: "right" },
    cAmt: { width: "16%", textAlign: "right" },
    refText: { fontFamily: "Inter", fontSize: 8, color: theme.accent },
    partText: { fontFamily: "Inter", fontSize: 8, color: ink70(theme) },
    descText: { fontFamily: "Cormorant Garamond", fontSize: 10, color: theme.ink },
    numCell: { fontFamily: "Inter", fontSize: 8.5, color: theme.ink },

    totalsBlock: { marginTop: 14, marginLeft: "auto", width: 240 },
    totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5 },
    totalsLabel: { fontFamily: "Inter", fontSize: 8.5, color: theme.ink },
    totalsValue: { fontFamily: "Inter", fontSize: 8.5, color: theme.ink },
    grandRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      paddingTop: 8,
      marginTop: 4,
      borderTopWidth: 0.6,
      borderTopColor: theme.accent,
    },
    grandLabel: {
      fontFamily: "Cormorant Garamond",
      fontStyle: "italic",
      fontSize: 10,
      color: ink70(theme),
      paddingBottom: 4,
    },
    grandValue: { fontFamily: "Cormorant Garamond", fontSize: 26, color: theme.accent },

    noteBlock: { marginTop: 16 },
    noteLabel: {
      fontFamily: "Inter",
      fontSize: 7,
      color: theme.accent,
      letterSpacing: 2,
      textTransform: "uppercase",
      marginBottom: 3,
    },
    noteText: { fontFamily: "Inter", fontSize: 8, color: ink70(theme), lineHeight: 1.5 },

    footer: { position: "absolute", bottom: 30, left: 56, right: 56 },
    footerLegal: {
      fontFamily: "Inter",
      fontSize: 6.5,
      color: theme.accent,
      letterSpacing: 0.8,
      textAlign: "center",
    },
    footerContact: {
      fontFamily: "Inter",
      fontSize: 6.5,
      color: mutedFor(theme),
      textAlign: "center",
      marginTop: 3,
    },
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

export function PurchaseOrderDocument({
  po,
  vendor,
  shipTo,
  lines,
  subtotal,
  opco,
}: PurchaseOrderDocumentProps) {
  const theme = getQuoteTheme(PO_THEME_SLUG);
  const styles = createStyles(theme);

  const taxAmount = Number(po.tax_amount ?? 0);
  const grandTotal = subtotal + taxAmount;
  const taxPct = po.tax_rate != null ? po.tax_rate * 100 : null;
  const taxLabel =
    taxPct != null ? `HST (${taxPct.toFixed(taxPct % 1 === 0 ? 0 : 2)}%)` : "HST";

  const opcoAddr = addressLines(opco);
  const vendorAddr = addressLines(vendor);
  const shipToAddr = addressLines(shipTo);

  return (
    <Document title={`Purchase Order ${po.po_number}`} author={opco.legal_name}>
      <Page size="A4" style={styles.page} wrap>
        {/* Brand wordmark */}
        <View style={styles.brandRow}>
          <Text style={styles.brandMark}>NEXVELON</Text>
          <Text style={styles.brandSub}>GLOBAL</Text>
        </View>
        <View style={styles.rule} />

        {/* Header: issuing entity (left) + PO title block (right) */}
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
            <Text style={styles.poTitle}>Purchase Order</Text>
            <Text style={styles.poNumber}>{po.po_number}</Text>
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Order date</Text>
              <Text style={styles.dateValue}>{safeDate(po.order_date)}</Text>
              {po.expected_date ? (
                <>
                  <Text style={styles.dateLabel}>Expected</Text>
                  <Text style={styles.dateValue}>{safeDate(po.expected_date)}</Text>
                </>
              ) : null}
              {po.ship_by_date ? (
                <>
                  <Text style={styles.dateLabel}>Ship by</Text>
                  <Text style={styles.dateValue}>{safeDate(po.ship_by_date)}</Text>
                </>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.rule} />

        {/* Vendor + Ship-to */}
        <View style={styles.partiesRow}>
          <View style={styles.partyCol}>
            <Text style={styles.partyLabel}>Vendor</Text>
            <Text style={styles.partyName}>{vendor.name || "—"}</Text>
            {vendorAddr.map((line, i) => (
              <Text style={styles.partyLine} key={i}>
                {line}
              </Text>
            ))}
            {vendor.sales_rep_name ? (
              <Text style={styles.attnLine}>Attn: {vendor.sales_rep_name}</Text>
            ) : null}
            {vendor.sales_rep_email ? (
              <Text style={styles.partyLine}>{vendor.sales_rep_email}</Text>
            ) : null}
            {vendor.sales_rep_phone ? (
              <Text style={styles.partyLine}>{vendor.sales_rep_phone}</Text>
            ) : null}
          </View>

          <View style={styles.partyCol}>
            <Text style={styles.partyLabel}>
              Ship To{shipTo.kind === "site" ? " (Drop-ship)" : ""}
            </Text>
            <Text style={styles.partyName}>{shipTo.name || "—"}</Text>
            {shipToAddr.map((line, i) => (
              <Text style={styles.partyLine} key={i}>
                {line}
              </Text>
            ))}
          </View>

          <View style={styles.partyCol}>
            <Text style={styles.partyLabel}>Bill To</Text>
            <Text style={styles.partyName}>{opco.legal_name}</Text>
            {opcoAddr.map((line, i) => (
              <Text style={styles.partyLine} key={i}>
                {line}
              </Text>
            ))}
          </View>
        </View>

        {/* Line items */}
        <View style={styles.tableHead}>
          <Text style={[styles.th, styles.cNum]}>#</Text>
          <Text style={[styles.th, styles.cPart]}>Part #</Text>
          <Text style={[styles.th, styles.cDesc]}>Description</Text>
          <Text style={[styles.th, styles.cQty]}>Qty</Text>
          <Text style={[styles.th, styles.cUnit]}>Unit Price</Text>
          <Text style={[styles.th, styles.cAmt]}>Total</Text>
        </View>
        {lines.length === 0 ? (
          <View style={styles.row}>
            <Text style={[styles.descText, { paddingLeft: 4 }]}>No line items.</Text>
          </View>
        ) : (
          lines.map((line, i) => (
            <View style={styles.row} key={`${line.line_no}-${i}`} wrap={false}>
              <View style={styles.cNum}>
                <Text style={styles.refText}>{String(i + 1).padStart(2, "0")}</Text>
              </View>
              <View style={styles.cPart}>
                <Text style={styles.partText}>{line.part_number || "—"}</Text>
              </View>
              <View style={styles.cDesc}>
                <Text style={styles.descText}>{line.description || "—"}</Text>
              </View>
              <Text style={[styles.numCell, styles.cQty]}>{Number(line.quantity)}</Text>
              <Text style={[styles.numCell, styles.cUnit]}>{money(Number(line.unit_cost))}</Text>
              <Text style={[styles.numCell, styles.cAmt]}>{money(Number(line.lineTotal))}</Text>
            </View>
          ))
        )}

        {/* Totals */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>{money(subtotal)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>{taxLabel}</Text>
            <Text style={styles.totalsValue}>{money(taxAmount)}</Text>
          </View>
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>Grand Total</Text>
            <Text style={styles.grandValue}>{money(grandTotal)}</Text>
          </View>
        </View>

        {/* Terms */}
        {po.terms || vendor.payment_terms ? (
          <View style={styles.noteBlock}>
            <Text style={styles.noteLabel}>Terms</Text>
            <Text style={styles.noteText}>{po.terms || vendor.payment_terms}</Text>
          </View>
        ) : null}

        {/* Special instructions / notes */}
        {po.notes ? (
          <View style={styles.noteBlock}>
            <Text style={styles.noteLabel}>Special Instructions</Text>
            <Text style={styles.noteText}>{po.notes}</Text>
          </View>
        ) : null}

        {/* Footer */}
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
