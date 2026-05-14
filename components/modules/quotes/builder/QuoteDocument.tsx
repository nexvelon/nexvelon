"use client";

import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { format, parseISO } from "date-fns";
import "@/lib/quote-fonts";
import { quoteTotals, sectionSubtotal } from "@/lib/quote-helpers";
import type { QuoteTheme } from "@/lib/quote-themes";
import type { QuoteTemplate } from "@/lib/company-profile";
import type { Client, QuoteSection, Site, User } from "@/lib/types";

// Derive a mid-grey from theme.ink at 60% alpha — adapts to whatever ink
// the chosen theme specifies (dark on light themes, light on dark themes).
function mutedFor(theme: QuoteTheme): string {
  return `${theme.ink}99`;
}

// Soft hairline border derived from theme.accent at 20% alpha.
function borderFor(theme: QuoteTheme): string {
  return `${theme.accent}33`;
}

// Factory: rebuilds the same StyleSheet shape on every render, parameterised
// by the active theme. Cost is negligible (one Object.values pass per
// render) and avoids any global mutable style state.
function createStyles(theme: QuoteTheme) {
  return StyleSheet.create({
    page: {
      fontFamily: "Inter",
      backgroundColor: theme.ambience,
      paddingHorizontal: 36,
      paddingVertical: 36,
      fontSize: 9,
      color: theme.ink,
    },
    letterhead: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 18,
      paddingBottom: 12,
      borderBottomWidth: 0.5,
      borderBottomColor: theme.accent,
    },
    brand: {
      fontFamily: "Cormorant Garamond",
      fontSize: 22,
      color: theme.accent,
      letterSpacing: 1.2,
    },
    brandSub: {
      fontSize: 8,
      color: mutedFor(theme),
      marginTop: 4,
    },
    contactBlock: {
      fontSize: 8,
      color: mutedFor(theme),
      textAlign: "right",
      lineHeight: 1.5,
    },
    quotationLabel: {
      fontFamily: "Cormorant Garamond",
      fontSize: 26,
      color: theme.accent,
      letterSpacing: 4,
      paddingBottom: 4,
      borderBottomWidth: 1.4,
      borderBottomColor: theme.accent,
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
      color: mutedFor(theme),
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 4,
    },
    metaTitle: {
      fontSize: 11,
      color: theme.accent,
      fontFamily: "Cormorant Garamond",
    },
    metaText: {
      fontSize: 9,
      color: theme.ink,
      lineHeight: 1.4,
    },
    section: {
      marginTop: 8,
    },
    sectionHeader: {
      fontFamily: "Cormorant Garamond",
      fontSize: 11,
      color: theme.accent,
      backgroundColor: theme.ambience,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderLeftWidth: 2,
      borderLeftColor: theme.accent,
      marginBottom: 4,
    },
    tableRow: {
      flexDirection: "row",
      paddingVertical: 4,
      borderBottomWidth: 0.4,
      borderBottomColor: borderFor(theme),
    },
    tableHead: {
      flexDirection: "row",
      paddingVertical: 4,
      borderBottomWidth: 0.6,
      borderBottomColor: theme.accent,
    },
    thText: {
      fontSize: 8,
      color: mutedFor(theme),
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    cellDesc: { width: "60%", paddingRight: 6 },
    cellQty: { width: "10%", textAlign: "right" },
    cellPrice: { width: "15%", textAlign: "right" },
    cellTotal: { width: "15%", textAlign: "right" },
    bodyText: { fontSize: 9, color: theme.ink },
    desc: { fontSize: 9, color: theme.ink },
    descMuted: { fontSize: 8, color: mutedFor(theme), marginTop: 1 },
    subtotalLine: {
      flexDirection: "row",
      justifyContent: "flex-end",
      paddingVertical: 3,
    },
    subtotalLabel: { fontSize: 8, color: mutedFor(theme), marginRight: 12 },
    subtotalValue: {
      fontSize: 9,
      color: theme.ink,
      width: 80,
      textAlign: "right",
    },
    totalsBox: {
      marginTop: 16,
      marginLeft: "auto",
      width: 240,
      paddingTop: 6,
      borderTopWidth: 0.6,
      borderTopColor: theme.accent,
    },
    totalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 3,
    },
    totalLabel: { fontSize: 9, color: theme.ink },
    totalValue: { fontSize: 9, color: theme.ink },
    grandLabel: {
      fontFamily: "Cormorant Garamond",
      fontSize: 12,
      color: theme.accent,
    },
    grandValue: {
      fontFamily: "Cormorant Garamond",
      fontSize: 14,
      color: theme.accent,
    },
    grandRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 3,
      marginTop: 4,
      paddingTop: 6,
      borderTopWidth: 0.6,
      borderTopColor: theme.accent,
    },
    termsTitle: {
      fontFamily: "Cormorant Garamond",
      fontSize: 11,
      color: theme.accent,
      marginTop: 22,
      marginBottom: 6,
    },
    terms: {
      fontSize: 7.5,
      color: mutedFor(theme),
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
      borderBottomColor: theme.ink,
      height: 22,
    },
    sigLabel: {
      fontSize: 7,
      color: mutedFor(theme),
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
      color: mutedFor(theme),
    },
  });
}

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
  theme: QuoteTheme;
  template: QuoteTemplate;
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
    theme,
    template,
  } = props;

  const styles = createStyles(theme);
  const totals = quoteTotals(sections, taxRatePct / 100, discount, discountType);
  const footerLine =
    template.footerLong ||
    `${template.legalName} · HST/GST ${template.hstNumber}`;

  return (
    <Document
      title={`Quote ${number}`}
      author={template.tradeName}
      subject={name ?? "Security systems quotation"}
    >
      <Page size="LETTER" style={styles.page} wrap>
        <View style={styles.letterhead}>
          <View>
            <Text style={styles.brand}>
              {template.tradeName.toUpperCase()}
            </Text>
            <Text style={styles.brandSub}>{template.tagline}</Text>
          </View>
          <View style={styles.contactBlock}>
            {template.address.line1 ? (
              <Text>{template.address.line1}</Text>
            ) : null}
            {template.address.line2 ? (
              <Text>{template.address.line2}</Text>
            ) : null}
            {(template.address.city ||
              template.address.province ||
              template.address.postalCode) && (
              <Text>
                {template.address.city}
                {template.address.city && template.address.province ? ", " : ""}
                {template.address.province}{" "}
                {template.address.postalCode}
              </Text>
            )}
            {template.phone ? <Text>{template.phone}</Text> : null}
            {template.email ? <Text>{template.email}</Text> : null}
            {template.web ? <Text>{template.web}</Text> : null}
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
                <Text style={[styles.bodyText, styles.cellDesc, { color: mutedFor(theme) }]}>
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
          <View style={styles.grandRow}>
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
            <Text style={styles.sigLabel}>For {template.tradeName}</Text>
          </View>
        </View>

        <Text style={styles.footer} fixed>
          {footerLine} · {number} · Page rendered{" "}
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
