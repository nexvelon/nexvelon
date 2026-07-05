"use client";

// INV-3 — branded parts pickup slip PDF (@react-pdf/renderer). Clones the
// PurchaseOrderDocument house look (Cormorant Garamond × Inter, antique-gold-
// on-cream, opco branding) so all issued artifacts read as one family. Pure
// render — no data fetching, no rendering-to-buffer (that's lib/pdf/
// render-pickup-slip.ts). Embeds the receiver's drawn-signature PNG when signed.

import React from "react";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { format, parseISO } from "date-fns";
import "@/lib/quote-fonts";
import { getQuoteTheme, type QuoteTheme } from "@/lib/quote-themes";
import type { PickupSlipRecipientType } from "@/lib/types/database";

const SLIP_THEME_SLUG = "solid_white" as const;

function mutedFor(theme: QuoteTheme): string {
  return `${theme.ink}99`;
}
function ink70(theme: QuoteTheme): string {
  return `${theme.ink}B3`;
}

function safeDate(iso: string | null, fmt = "MMMM d, yyyy 'at' h:mm a"): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), fmt);
  } catch {
    return iso;
  }
}

const RECIPIENT_LABEL: Record<PickupSlipRecipientType, string> = {
  truck: "Truck",
  tech: "Technician",
  sub: "Subcontractor",
};

function addressLines(p: {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
}): string[] {
  const cityLine = [p.city, p.province].filter(Boolean).join(", ");
  const cityPostal = [cityLine, p.postal_code].filter(Boolean).join("  ");
  return [p.address_line1, p.address_line2, cityPostal || null].filter(
    (s): s is string => !!s && s.trim().length > 0
  );
}

export interface PickupSlipDocumentProps {
  slip: {
    slip_number: string;
    issued_at: string;
    issued_by_name: string;
    recipient_type: PickupSlipRecipientType;
    recipient_name: string;
    signature_data_url: string | null;
    signature_captured_at: string | null;
    notes: string | null;
  };
  lines: {
    line_no: number;
    product_sku: string;
    product_name: string;
    serial_number: string | null;
    quantity: number;
  }[];
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
    slipTitle: {
      fontFamily: "Cormorant Garamond",
      fontStyle: "italic",
      fontSize: 26,
      color: theme.accent,
      textAlign: "right",
    },
    slipNumber: {
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
    cNum: { width: "8%", paddingRight: 4 },
    cSku: { width: "22%", paddingRight: 6 },
    cDesc: { width: "40%", paddingRight: 6 },
    cSerial: { width: "20%", paddingRight: 6 },
    cQty: { width: "10%", textAlign: "right" },
    refText: { fontFamily: "Inter", fontSize: 8, color: theme.accent },
    skuText: { fontFamily: "Inter", fontSize: 8, color: ink70(theme) },
    descText: { fontFamily: "Cormorant Garamond", fontSize: 10, color: theme.ink },
    serialText: { fontFamily: "Inter", fontSize: 8, color: ink70(theme) },
    numCell: { fontFamily: "Inter", fontSize: 8.5, color: theme.ink },

    sigBlock: { marginTop: 26, width: 280 },
    sigLabel: {
      fontFamily: "Inter",
      fontSize: 7,
      color: theme.accent,
      letterSpacing: 2,
      textTransform: "uppercase",
      marginBottom: 6,
    },
    sigImage: { height: 64, objectFit: "contain", marginBottom: 4 },
    sigPlaceholder: {
      height: 64,
      borderWidth: 0.6,
      borderColor: `${theme.accent}66`,
      borderStyle: "dashed",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
    },
    sigPlaceholderText: {
      fontFamily: "Inter",
      fontSize: 8,
      color: mutedFor(theme),
    },
    sigRule: {
      borderTopWidth: 0.6,
      borderTopColor: theme.ink,
      paddingTop: 3,
    },
    sigName: { fontFamily: "Cormorant Garamond", fontSize: 11, color: theme.ink },
    sigMeta: { fontFamily: "Inter", fontSize: 7.5, color: mutedFor(theme), marginTop: 1 },

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

export function PickupSlipDocument({ slip, lines, opco }: PickupSlipDocumentProps) {
  const theme = getQuoteTheme(SLIP_THEME_SLUG);
  const styles = createStyles(theme);
  const opcoAddr = addressLines(opco);
  const recipientLabel = RECIPIENT_LABEL[slip.recipient_type] ?? "Recipient";

  return (
    <Document title={`Pickup Slip ${slip.slip_number}`} author={opco.legal_name}>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.brandRow}>
          <Text style={styles.brandMark}>NEXVELON</Text>
          <Text style={styles.brandSub}>GLOBAL</Text>
        </View>
        <View style={styles.rule} />

        {/* Header: issuing entity (left) + slip title block (right) */}
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
            <Text style={styles.slipTitle}>Parts Pickup Slip</Text>
            <Text style={styles.slipNumber}>{slip.slip_number}</Text>
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Issued</Text>
              <Text style={styles.dateValue}>{safeDate(slip.issued_at)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.rule} />

        {/* Issued by + Issued to */}
        <View style={styles.partiesRow}>
          <View style={styles.partyCol}>
            <Text style={styles.partyLabel}>Issued By</Text>
            <Text style={styles.partyName}>{slip.issued_by_name || "—"}</Text>
            <Text style={styles.partyLine}>{opco.legal_name}</Text>
          </View>
          <View style={styles.partyCol}>
            <Text style={styles.partyLabel}>Issued To</Text>
            <Text style={styles.partyName}>{slip.recipient_name || "—"}</Text>
            <Text style={styles.partyLine}>{recipientLabel}</Text>
          </View>
        </View>

        {/* Line items */}
        <View style={styles.tableHead}>
          <Text style={[styles.th, styles.cNum]}>#</Text>
          <Text style={[styles.th, styles.cSku]}>SKU</Text>
          <Text style={[styles.th, styles.cDesc]}>Product</Text>
          <Text style={[styles.th, styles.cSerial]}>Serial</Text>
          <Text style={[styles.th, styles.cQty]}>Qty</Text>
        </View>
        {lines.length === 0 ? (
          <View style={styles.row}>
            <Text style={[styles.descText, { paddingLeft: 4 }]}>No parts on this slip.</Text>
          </View>
        ) : (
          lines.map((line, i) => (
            <View style={styles.row} key={`${line.line_no}-${i}`} wrap={false}>
              <View style={styles.cNum}>
                <Text style={styles.refText}>{String(line.line_no).padStart(2, "0")}</Text>
              </View>
              <View style={styles.cSku}>
                <Text style={styles.skuText}>{line.product_sku || "—"}</Text>
              </View>
              <View style={styles.cDesc}>
                <Text style={styles.descText}>{line.product_name || "—"}</Text>
              </View>
              <View style={styles.cSerial}>
                <Text style={styles.serialText}>{line.serial_number || "—"}</Text>
              </View>
              <Text style={[styles.numCell, styles.cQty]}>{Number(line.quantity)}</Text>
            </View>
          ))
        )}

        {/* Signature block */}
        <View style={styles.sigBlock}>
          <Text style={styles.sigLabel}>Received By — Signature</Text>
          {slip.signature_data_url ? (
            // React.createElement (not <Image/>) sidesteps the jsx-a11y/alt-text
            // false positive on react-pdf's Image — matching lib/pdf/signed-tc-pdf.
            React.createElement(Image, {
              style: styles.sigImage,
              src: slip.signature_data_url,
            })
          ) : (
            <View style={styles.sigPlaceholder}>
              <Text style={styles.sigPlaceholderText}>Signature required</Text>
            </View>
          )}
          <View style={styles.sigRule}>
            <Text style={styles.sigName}>{slip.recipient_name || "—"}</Text>
            <Text style={styles.sigMeta}>
              {slip.signature_captured_at
                ? `Signed ${safeDate(slip.signature_captured_at)}`
                : "Awaiting signature"}
            </Text>
          </View>
        </View>

        {/* Notes */}
        {slip.notes ? (
          <View style={styles.noteBlock}>
            <Text style={styles.noteLabel}>Notes</Text>
            <Text style={styles.noteText}>{slip.notes}</Text>
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
