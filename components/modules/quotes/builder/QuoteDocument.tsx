"use client";

import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { format, parseISO } from "date-fns";
import { quoteTotals, sectionSubtotal } from "@/lib/quote-helpers";
import type { Client, QuoteSection, Site, User } from "@/lib/types";

const COLORS = {
  navy: "#0B1B3B",
  gold: "#C9A24B",
  ivory: "#F8F5EE",
  charcoal: "#1F2937",
  muted: "#6B7280",
  border: "#E5DFD2",
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 36,
    paddingVertical: 36,
    fontSize: 9,
    color: COLORS.charcoal,
  },
  letterhead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 18,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.gold,
  },
  brand: {
    fontFamily: "Times-Roman",
    fontSize: 22,
    color: COLORS.navy,
    letterSpacing: 1.2,
  },
  brandSub: {
    fontSize: 8,
    color: COLORS.muted,
    marginTop: 4,
  },
  contactBlock: {
    fontSize: 8,
    color: COLORS.muted,
    textAlign: "right",
    lineHeight: 1.5,
  },
  quotationLabel: {
    fontFamily: "Times-Roman",
    fontSize: 26,
    color: COLORS.navy,
    letterSpacing: 4,
    paddingBottom: 4,
    borderBottomWidth: 1.4,
    borderBottomColor: COLORS.gold,
    alignSelf: "flex-start",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
    marginBottom: 18,
  },
  metaCol: {
    width: "48%",
  },
  blockTitle: {
    fontSize: 8,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  metaTitle: {
    fontSize: 11,
    color: COLORS.navy,
    fontFamily: "Times-Roman",
  },
  metaText: {
    fontSize: 9,
    color: COLORS.charcoal,
    lineHeight: 1.4,
  },
  section: {
    marginTop: 8,
  },
  sectionHeader: {
    fontFamily: "Times-Roman",
    fontSize: 11,
    color: COLORS.navy,
    backgroundColor: COLORS.ivory,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.gold,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 0.4,
    borderBottomColor: COLORS.border,
  },
  tableHead: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 0.6,
    borderBottomColor: COLORS.navy,
  },
  thText: {
    fontSize: 8,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  cellDesc: { width: "60%", paddingRight: 6 },
  cellQty: { width: "10%", textAlign: "right" },
  cellPrice: { width: "15%", textAlign: "right" },
  cellTotal: { width: "15%", textAlign: "right" },
  bodyText: { fontSize: 9, color: COLORS.charcoal },
  desc: { fontSize: 9, color: COLORS.charcoal },
  descMuted: { fontSize: 8, color: COLORS.muted, marginTop: 1 },
  subtotalLine: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingVertical: 3,
  },
  subtotalLabel: { fontSize: 8, color: COLORS.muted, marginRight: 12 },
  subtotalValue: {
    fontSize: 9,
    color: COLORS.charcoal,
    width: 80,
    textAlign: "right",
  },
  totalsBox: {
    marginTop: 16,
    marginLeft: "auto",
    width: 240,
    paddingTop: 6,
    borderTopWidth: 0.6,
    borderTopColor: COLORS.navy,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  totalLabel: { fontSize: 9, color: COLORS.charcoal },
  totalValue: { fontSize: 9, color: COLORS.charcoal },
  grandLabel: {
    fontFamily: "Times-Roman",
    fontSize: 12,
    color: COLORS.navy,
  },
  grandValue: {
    fontFamily: "Times-Roman",
    fontSize: 14,
    color: COLORS.navy,
  },
  termsTitle: {
    fontFamily: "Times-Roman",
    fontSize: 11,
    color: COLORS.navy,
    marginTop: 22,
    marginBottom: 6,
  },
  terms: {
    fontSize: 7.5,
    color: COLORS.muted,
    lineHeight: 1.45,
  },
  signatures: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 32,
  },
  sigBlock: { width: "45%" },
  sigLine: {
    borderBottomWidth: 0.6,
    borderBottomColor: COLORS.charcoal,
    height: 22,
  },
  sigLabel: {
    fontSize: 7,
    color: COLORS.muted,
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 36,
    right: 36,
    textAlign: "center",
    fontSize: 7,
    color: COLORS.muted,
  },
});

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

interface DocProps {
  number: string;
  name?: string;
  createdAt: string;
  validUntil: string;
  paymentTerms: string;
  projectType: string;
  client?: Client;
  site?: Site;
  owner?: User;
  sections: QuoteSection[];
  taxRatePct: number;
  discount: number;
  discountType: "pct" | "amount";
  terms: string;
}

export function QuoteDocument(props: DocProps) {
  const {
    number,
    name,
    createdAt,
    validUntil,
    paymentTerms,
    projectType,
    client,
    site,
    owner,
    sections,
    taxRatePct,
    discount,
    discountType,
    terms,
  } = props;

  const totals = quoteTotals(sections, taxRatePct / 100, discount, discountType);

  return (
    <Document
      title={`Quote ${number}`}
      author="Nexvelon"
      subject={name ?? "Security systems quotation"}
    >
      <Page size="LETTER" style={styles.page} wrap>
        <View style={styles.letterhead}>
          <View>
            <Text style={styles.brand}>NEXVELON</Text>
            <Text style={styles.brandSub}>Security Systems · Integrated Solutions</Text>
          </View>
          <View style={styles.contactBlock}>
            <Text>240 Front Street West, Suite 420</Text>
            <Text>Toronto, ON M5V 1A4 · Canada</Text>
            <Text>(416) 555-0100 · sales@nexvelon.com</Text>
            <Text>HST # 81245-6709 RT0001</Text>
          </View>
        </View>

        <Text style={styles.quotationLabel}>QUOTATION</Text>

        <View style={styles.metaRow}>
          <View style={styles.metaCol}>
            <Text style={styles.blockTitle}>Bill To</Text>
            {client ? (
              <View>
                <Text style={styles.metaTitle}>{client.name}</Text>
                <Text style={styles.metaText}>{client.contactName}</Text>
                <Text style={styles.metaText}>{client.address}</Text>
                <Text style={styles.metaText}>
                  {client.city}, {client.state}
                </Text>
                <Text style={styles.metaText}>{client.email}</Text>
              </View>
            ) : (
              <Text style={styles.metaText}>Client to be assigned</Text>
            )}
            <Text style={[styles.blockTitle, { marginTop: 12 }]}>Service Site</Text>
            {site ? (
              <View>
                <Text style={styles.metaTitle}>{site.name}</Text>
                <Text style={styles.metaText}>{site.address}</Text>
                <Text style={styles.metaText}>
                  {site.city}, {site.state}
                </Text>
              </View>
            ) : (
              <Text style={styles.metaText}>Site to be assigned</Text>
            )}
          </View>

          <View style={[styles.metaCol, { textAlign: "right" }]}>
            <Text style={styles.blockTitle}>Quote #</Text>
            <Text style={[styles.metaTitle, { fontSize: 14 }]}>{number}</Text>

            <View style={{ marginTop: 10 }}>
              <Text style={styles.blockTitle}>Issued</Text>
              <Text style={styles.metaText}>
                {safeFormat(createdAt, "MMMM d, yyyy")}
              </Text>
            </View>

            <View style={{ marginTop: 10 }}>
              <Text style={styles.blockTitle}>Valid Until</Text>
              <Text style={styles.metaText}>
                {safeFormat(validUntil, "MMMM d, yyyy")}
              </Text>
            </View>

            <View style={{ marginTop: 10 }}>
              <Text style={styles.blockTitle}>Project Type</Text>
              <Text style={styles.metaText}>{projectType}</Text>
            </View>

            <View style={{ marginTop: 10 }}>
              <Text style={styles.blockTitle}>Payment Terms</Text>
              <Text style={styles.metaText}>{paymentTerms}</Text>
            </View>

            {owner && (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.blockTitle}>Prepared By</Text>
                <Text style={styles.metaText}>{owner.name}</Text>
                <Text style={styles.metaText}>{owner.email}</Text>
              </View>
            )}
          </View>
        </View>

        {name && (
          <View style={{ marginBottom: 6 }}>
            <Text style={styles.blockTitle}>Project</Text>
            <Text style={styles.metaTitle}>{name}</Text>
          </View>
        )}

        {sections.map((s) => (
          <View style={styles.section} key={s.id} wrap={false}>
            <Text style={styles.sectionHeader}>{s.name}</Text>
            <View style={styles.tableHead}>
              <Text style={[styles.thText, styles.cellDesc]}>Description</Text>
              <Text style={[styles.thText, styles.cellQty]}>Qty</Text>
              <Text style={[styles.thText, styles.cellPrice]}>Unit Price</Text>
              <Text style={[styles.thText, styles.cellTotal]}>Total</Text>
            </View>
            {s.items.length === 0 && (
              <View style={styles.tableRow}>
                <Text style={[styles.bodyText, styles.cellDesc, { color: COLORS.muted }]}>
                  No items in this section.
                </Text>
              </View>
            )}
            {s.items.map((it) => {
              const isLabor = it.type === "labor";
              const total = isLabor
                ? (it.hours ?? 0) * (it.rate ?? 0)
                : it.qty * it.unitPrice;
              const unit = isLabor ? (it.rate ?? 0) : it.unitPrice;
              const qty = isLabor ? `${it.hours ?? 0} hrs` : it.qty.toString();
              return (
                <View style={styles.tableRow} key={it.id}>
                  <View style={styles.cellDesc}>
                    <Text style={styles.desc}>
                      {it.description || "—"}
                    </Text>
                    {!isLabor && it.sku && (
                      <Text style={styles.descMuted}>
                        SKU {it.sku}
                        {it.vendor ? ` · ${it.vendor}` : ""}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.bodyText, styles.cellQty]}>{qty}</Text>
                  <Text style={[styles.bodyText, styles.cellPrice]}>
                    {usd(unit)}
                  </Text>
                  <Text style={[styles.bodyText, styles.cellTotal]}>
                    {usd(total)}
                  </Text>
                </View>
              );
            })}
            <View style={styles.subtotalLine}>
              <Text style={styles.subtotalLabel}>Section subtotal</Text>
              <Text style={styles.subtotalValue}>
                {usd(sectionSubtotal(s))}
              </Text>
            </View>
          </View>
        ))}

        <View style={styles.totalsBox}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{usd(totals.subtotal)}</Text>
          </View>
          {totals.discountAmount > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Discount</Text>
              <Text style={styles.totalValue}>
                −{usd(totals.discountAmount)}
              </Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              Tax ({taxRatePct.toFixed(2)}%)
            </Text>
            <Text style={styles.totalValue}>{usd(totals.tax)}</Text>
          </View>
          <View
            style={[
              styles.totalRow,
              {
                marginTop: 4,
                paddingTop: 6,
                borderTopWidth: 0.6,
                borderTopColor: COLORS.navy,
              },
            ]}
          >
            <Text style={styles.grandLabel}>Total</Text>
            <Text style={styles.grandValue}>{usd(totals.total)}</Text>
          </View>
        </View>

        <Text style={styles.termsTitle}>Terms & Conditions</Text>
        <Text style={styles.terms}>{terms}</Text>

        <View style={styles.signatures}>
          <View style={styles.sigBlock}>
            <View style={styles.sigLine} />
            <Text style={styles.sigLabel}>Accepted by Client</Text>
          </View>
          <View style={styles.sigBlock}>
            <View style={styles.sigLine} />
            <Text style={styles.sigLabel}>For Nexvelon</Text>
          </View>
        </View>

        <Text style={styles.footer} fixed>
          Nexvelon Inc. · {number} · Page rendered{" "}
          {format(new Date(), "MMM d, yyyy")} · Subject to terms above.
        </Text>
      </Page>
    </Document>
  );
}

function safeFormat(iso: string, fmt: string): string {
  try {
    return format(parseISO(iso), fmt);
  } catch {
    return iso;
  }
}
