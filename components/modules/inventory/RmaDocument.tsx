"use client";

// INV-4 — branded Return Merchandise Authorization PDF (@react-pdf/renderer).
// Clones the PurchaseOrderDocument / PickupSlipDocument house look (Cormorant
// Garamond × Inter, antique-gold-on-cream, opco branding). Pure render — no
// data fetching, no rendering-to-buffer (that's lib/pdf/render-rma.ts).

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { format, parseISO } from "date-fns";
import "@/lib/quote-fonts";
import { getQuoteTheme, type QuoteTheme } from "@/lib/quote-themes";
import type { DbRmaReason, DbRmaStatus } from "@/lib/types/database";

const RMA_THEME_SLUG = "solid_white" as const;

function mutedFor(theme: QuoteTheme): string {
  return `${theme.ink}99`;
}
function ink70(theme: QuoteTheme): string {
  return `${theme.ink}B3`;
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

const REASON_LABEL: Record<DbRmaReason, string> = {
  defective: "Defective",
  wrong_part: "Wrong part",
  over_shipment: "Over-shipment",
  warranty: "Warranty",
  other: "Other",
};

const CARRIER_LABEL: Record<string, string> = {
  ups: "UPS",
  fedex: "FedEx",
  purolator: "Purolator",
  other: "Other",
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

export interface RmaDocumentProps {
  rma: {
    rma_number: string;
    created_at: string;
    created_by_name: string;
    status: DbRmaStatus;
    reason: DbRmaReason;
    reason_detail: string | null;
    tracking_carrier: string | null;
    tracking_number: string | null;
    notes: string | null;
  };
  vendor: {
    name: string;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    province: string | null;
    postal_code: string | null;
    sales_rep_name: string | null;
  };
  lines: {
    line_no: number;
    product_sku: string;
    product_name: string;
    serial_number: string | null;
    quantity: number;
    unit_cost: number;
    line_total: number;
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
    rule: { borderBottomWidth: 0.6, borderBottomColor: theme.accent, marginVertical: 12 },
    headerRow: { flexDirection: "row", justifyContent: "space-between" },
    headerCol: { flex: 1, paddingRight: 12 },
    headerColRight: { width: 220, alignItems: "flex-end" },
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
    rmaTitle: {
      fontFamily: "Cormorant Garamond",
      fontStyle: "italic",
      fontSize: 22,
      color: theme.accent,
      textAlign: "right",
    },
    rmaNumber: {
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

    reasonBlock: { marginTop: 6, marginBottom: 2 },
    reasonText: { fontFamily: "Inter", fontSize: 8.5, color: theme.ink },
    reasonDetail: { fontFamily: "Inter", fontSize: 8, color: ink70(theme), marginTop: 2, lineHeight: 1.5 },

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
    cSku: { width: "16%", paddingRight: 6 },
    cDesc: { width: "30%", paddingRight: 6 },
    cSerial: { width: "16%", paddingRight: 6 },
    cQty: { width: "8%", textAlign: "right" },
    cUnit: { width: "12%", textAlign: "right" },
    cAmt: { width: "12%", textAlign: "right" },
    refText: { fontFamily: "Inter", fontSize: 8, color: theme.accent },
    skuText: { fontFamily: "Inter", fontSize: 8, color: ink70(theme) },
    descText: { fontFamily: "Cormorant Garamond", fontSize: 10, color: theme.ink },
    serialText: { fontFamily: "Inter", fontSize: 8, color: ink70(theme) },
    numCell: { fontFamily: "Inter", fontSize: 8.5, color: theme.ink },

    totalsBlock: { marginTop: 14, marginLeft: "auto", width: 240 },
    grandRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      paddingTop: 8,
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
    grandValue: { fontFamily: "Cormorant Garamond", fontSize: 22, color: theme.accent },

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

export function RmaDocument({ rma, vendor, lines, subtotal, opco }: RmaDocumentProps) {
  const theme = getQuoteTheme(RMA_THEME_SLUG);
  const styles = createStyles(theme);
  const opcoAddr = addressLines(opco);
  const vendorAddr = addressLines(vendor);
  const carrier = rma.tracking_carrier
    ? CARRIER_LABEL[rma.tracking_carrier] ?? rma.tracking_carrier
    : null;

  return (
    <Document title={`RMA ${rma.rma_number}`} author={opco.legal_name}>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.brandRow}>
          <Text style={styles.brandMark}>NEXVELON</Text>
          <Text style={styles.brandSub}>GLOBAL</Text>
        </View>
        <View style={styles.rule} />

        {/* Header: issuing entity + RMA title */}
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
            <Text style={styles.rmaTitle}>Return Merchandise Authorization</Text>
            <Text style={styles.rmaNumber}>{rma.rma_number}</Text>
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Issued</Text>
              <Text style={styles.dateValue}>{safeDate(rma.created_at)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.rule} />

        {/* Return to (vendor) + Return from (opco) */}
        <View style={styles.partiesRow}>
          <View style={styles.partyCol}>
            <Text style={styles.partyLabel}>Return To</Text>
            <Text style={styles.partyName}>{vendor.name || "—"}</Text>
            {vendorAddr.map((line, i) => (
              <Text style={styles.partyLine} key={i}>
                {line}
              </Text>
            ))}
            {vendor.sales_rep_name ? (
              <Text style={styles.attnLine}>Attn: {vendor.sales_rep_name}</Text>
            ) : null}
          </View>
          <View style={styles.partyCol}>
            <Text style={styles.partyLabel}>Return From</Text>
            <Text style={styles.partyName}>{opco.legal_name}</Text>
            {opcoAddr.map((line, i) => (
              <Text style={styles.partyLine} key={i}>
                {line}
              </Text>
            ))}
          </View>
        </View>

        {/* Reason */}
        <View style={styles.reasonBlock}>
          <Text style={styles.partyLabel}>Reason for Return</Text>
          <Text style={styles.reasonText}>{REASON_LABEL[rma.reason] ?? rma.reason}</Text>
          {rma.reason_detail ? (
            <Text style={styles.reasonDetail}>{rma.reason_detail}</Text>
          ) : null}
        </View>

        {/* Line items */}
        <View style={styles.tableHead}>
          <Text style={[styles.th, styles.cNum]}>#</Text>
          <Text style={[styles.th, styles.cSku]}>SKU</Text>
          <Text style={[styles.th, styles.cDesc]}>Product</Text>
          <Text style={[styles.th, styles.cSerial]}>Serial</Text>
          <Text style={[styles.th, styles.cQty]}>Qty</Text>
          <Text style={[styles.th, styles.cUnit]}>Unit Cost</Text>
          <Text style={[styles.th, styles.cAmt]}>Total</Text>
        </View>
        {lines.length === 0 ? (
          <View style={styles.row}>
            <Text style={[styles.descText, { paddingLeft: 4 }]}>No parts on this RMA.</Text>
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
              <Text style={[styles.numCell, styles.cUnit]}>{money(Number(line.unit_cost))}</Text>
              <Text style={[styles.numCell, styles.cAmt]}>{money(Number(line.line_total))}</Text>
            </View>
          ))
        )}

        {/* Total return value */}
        <View style={styles.totalsBlock}>
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>Total Return Value</Text>
            <Text style={styles.grandValue}>{money(subtotal)}</Text>
          </View>
        </View>

        {/* Return instructions (auto-filled) */}
        <View style={styles.noteBlock}>
          <Text style={styles.noteLabel}>Return Instructions</Text>
          <Text style={styles.noteText}>
            Please issue credit or a replacement for these items. Reference RMA{" "}
            {rma.rma_number} on all correspondence, packing slips, and credit memos.
          </Text>
        </View>

        {/* Tracking (if provided) */}
        {carrier || rma.tracking_number ? (
          <View style={styles.noteBlock}>
            <Text style={styles.noteLabel}>Shipment Tracking</Text>
            <Text style={styles.noteText}>
              {[carrier, rma.tracking_number].filter(Boolean).join(" · ")}
            </Text>
          </View>
        ) : null}

        {/* Notes */}
        {rma.notes ? (
          <View style={styles.noteBlock}>
            <Text style={styles.noteLabel}>Notes</Text>
            <Text style={styles.noteText}>{rma.notes}</Text>
          </View>
        ) : null}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerLegal}>
            {opco.legal_name.toUpperCase()} — HST/GST {opco.hst_number}
          </Text>
          <Text style={styles.footerContact}>
            Please return to: {[opco.address_line1, opco.city, opco.province, opco.postal_code].filter(Boolean).join(", ")}
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
