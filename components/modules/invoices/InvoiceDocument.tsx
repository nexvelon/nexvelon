"use client";

// INVOICE-1b — branded invoice PDF (@react-pdf/renderer), mirroring the quote
// document's fonts (Cormorant Garamond × Inter) and navy/antique-gold house
// theme. The issuing entity's legal name, registered office, and HST number are
// resolved by invoice.opco from QUOTE_TEMPLATES — the SAME single source the
// quote PDF letterhead uses, so Guardian and Integrated each print correctly.

import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { format, parseISO } from "date-fns";
import "@/lib/quote-fonts";
import type { QuoteTheme } from "@/lib/quote-themes";
import type { QuoteTemplate } from "@/lib/company-profile";
import type { DbInvoice, DbInvoiceLine } from "@/lib/types/database";
import type { InvoiceParty } from "@/lib/api/invoices";

function ink70(theme: QuoteTheme): string {
  return `${theme.ink}B3`; // 70% alpha
}
function mutedFor(theme: QuoteTheme): string {
  return `${theme.ink}99`; // 60% alpha
}

function currencyFmt(currency: string) {
  return (n: number) =>
    new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: currency || "CAD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
}

function safeDate(iso: string | null, fmt = "MMMM d, yyyy"): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), fmt);
  } catch {
    return iso;
  }
}

// A party's address as ordered, non-empty lines.
function addressLines(p: InvoiceParty | null): string[] {
  if (!p) return [];
  const cityLine = [p.city, p.province].filter(Boolean).join(", ");
  const cityPostal = [cityLine, p.postal].filter(Boolean).join("  ");
  return [
    p.street,
    p.unit,
    cityPostal || null,
    p.country,
  ].filter((s): s is string => !!s && s.trim().length > 0);
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

    // Brand wordmark
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

    // Header: entity (left) + title block (right)
    headerRow: { flexDirection: "row", justifyContent: "space-between" },
    headerCol: { flex: 1, paddingRight: 12 },
    headerColRight: { width: 200, alignItems: "flex-end" },
    entityName: {
      fontFamily: "Cormorant Garamond",
      fontSize: 13,
      color: theme.ink,
      marginBottom: 3,
    },
    entityLine: {
      fontFamily: "Inter",
      fontSize: 7.5,
      color: mutedFor(theme),
      lineHeight: 1.5,
    },
    entityHst: {
      fontFamily: "Inter",
      fontSize: 7.5,
      fontWeight: 500,
      color: ink70(theme),
      marginTop: 4,
    },
    invoiceTitle: {
      fontFamily: "Cormorant Garamond",
      fontStyle: "italic",
      fontSize: 32,
      color: theme.accent,
    },
    invoiceNumber: {
      fontFamily: "Inter",
      fontWeight: 500,
      fontSize: 11,
      color: theme.ink,
      letterSpacing: 0.5,
      marginTop: 2,
    },
    draftMark: {
      fontFamily: "Inter",
      fontWeight: 500,
      fontSize: 10,
      color: "#b3402f",
      letterSpacing: 1.5,
      marginTop: 4,
      borderWidth: 0.8,
      borderColor: "#b3402f",
      paddingHorizontal: 6,
      paddingVertical: 3,
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

    // Bill-to / service-location columns
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
    partyLine: {
      fontFamily: "Inter",
      fontSize: 8,
      color: mutedFor(theme),
      lineHeight: 1.5,
    },
    projectRef: {
      fontFamily: "Inter",
      fontSize: 8,
      color: ink70(theme),
      marginTop: 2,
    },

    // Line table
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
    cDesc: { width: "54%", paddingRight: 6 },
    cQty: { width: "10%", textAlign: "right" },
    cUnit: { width: "14%", textAlign: "right" },
    cAmt: { width: "16%", textAlign: "right" },
    refText: {
      fontFamily: "Inter",
      fontSize: 8,
      color: theme.accent,
    },
    descText: {
      fontFamily: "Cormorant Garamond",
      fontSize: 10,
      color: theme.ink,
    },
    drawNote: {
      fontFamily: "Inter",
      fontSize: 6.5,
      color: mutedFor(theme),
      marginTop: 1,
    },
    numCell: {
      fontFamily: "Inter",
      fontSize: 8.5,
      color: theme.ink,
    },

    // Totals
    totalsBlock: { marginTop: 14, marginLeft: "auto", width: 240 },
    totalsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 2.5,
    },
    totalsLabel: { fontFamily: "Inter", fontSize: 8.5, color: theme.ink },
    totalsValue: { fontFamily: "Inter", fontSize: 8.5, color: theme.ink },
    totalsMuted: { fontFamily: "Inter", fontSize: 8.5, color: mutedFor(theme) },
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
    grandValue: {
      fontFamily: "Cormorant Garamond",
      fontSize: 28,
      color: theme.accent,
    },

    // Footer
    footer: {
      position: "absolute",
      bottom: 30,
      left: 56,
      right: 56,
    },
    footerRemit: {
      fontFamily: "Cormorant Garamond",
      fontStyle: "italic",
      fontSize: 9,
      color: theme.ink,
      textAlign: "center",
    },
    footerTerms: {
      fontFamily: "Inter",
      fontSize: 7.5,
      color: mutedFor(theme),
      textAlign: "center",
      marginTop: 3,
    },
    footerLegal: {
      fontFamily: "Inter",
      fontSize: 6.5,
      color: theme.accent,
      letterSpacing: 0.8,
      textAlign: "center",
      marginTop: 6,
    },
  });
}

export interface InvoiceDocumentProps {
  invoice: DbInvoice;
  lines: DbInvoiceLine[];
  billTo: InvoiceParty | null;
  serviceLocation: InvoiceParty | null;
  projectNumber: string | null;
  projectTitle: string | null;
  template: QuoteTemplate;
  theme: QuoteTheme;
}

export function InvoiceDocument({
  invoice,
  lines,
  billTo,
  serviceLocation,
  projectNumber,
  projectTitle,
  template,
  theme,
}: InvoiceDocumentProps) {
  const styles = createStyles(theme);
  const money = currencyFmt(invoice.currency);
  const issued = Boolean(invoice.invoice_number);
  const holdbackRate = Number(invoice.holdback_rate);
  const taxRate = Number(invoice.tax_rate);

  const billLines = addressLines(billTo);
  const siteLines = addressLines(serviceLocation);

  const a = template.address;
  const entityCity = [a.city, a.province].filter(Boolean).join(", ");
  const entityCityPostal = [entityCity, a.postalCode].filter(Boolean).join("  ");

  return (
    <Document
      title={invoice.invoice_number ?? "Invoice (draft)"}
      author={template.legalName}
    >
      <Page size="A4" style={styles.page} wrap>
        {/* Brand wordmark */}
        <View style={styles.brandRow}>
          <Text style={styles.brandMark}>{template.brandMark}</Text>
          <Text style={styles.brandSub}>{template.brandSub}</Text>
        </View>
        <View style={styles.rule} />

        {/* Header: entity (left) + title block (right) */}
        <View style={styles.headerRow}>
          <View style={styles.headerCol}>
            <Text style={styles.entityName}>{template.legalName}</Text>
            {[a.line1, a.line2, entityCityPostal, a.country]
              .filter((s) => s && s.trim().length > 0)
              .map((line, i) => (
                <Text style={styles.entityLine} key={i}>
                  {line}
                </Text>
              ))}
            <Text style={styles.entityHst}>HST/GST {template.hstNumber}</Text>
          </View>

          <View style={styles.headerColRight}>
            <Text style={styles.invoiceTitle}>Invoice</Text>
            {issued ? (
              <Text style={styles.invoiceNumber}>{invoice.invoice_number}</Text>
            ) : (
              <Text style={styles.draftMark}>DRAFT — NOT ISSUED</Text>
            )}
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Issue date</Text>
              <Text style={styles.dateValue}>{safeDate(invoice.issue_date)}</Text>
              <Text style={styles.dateLabel}>Due date</Text>
              <Text style={styles.dateValue}>{safeDate(invoice.due_date)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.rule} />

        {/* Bill-to + service location */}
        <View style={styles.partiesRow}>
          <View style={styles.partyCol}>
            <Text style={styles.partyLabel}>Bill To</Text>
            <Text style={styles.partyName}>
              {billTo?.legal_name || billTo?.name || "—"}
            </Text>
            {billTo?.legal_name && billTo?.name && billTo.legal_name !== billTo.name ? (
              <Text style={styles.partyLine}>{billTo.name}</Text>
            ) : null}
            {billLines.map((line, i) => (
              <Text style={styles.partyLine} key={i}>
                {line}
              </Text>
            ))}
            {projectNumber ? (
              <Text style={styles.projectRef}>
                Project {projectNumber}
                {projectTitle ? ` · ${projectTitle}` : ""}
              </Text>
            ) : null}
          </View>

          {serviceLocation ? (
            <View style={styles.partyCol}>
              <Text style={styles.partyLabel}>Service Location</Text>
              <Text style={styles.partyName}>{serviceLocation.name || "—"}</Text>
              {siteLines.map((line, i) => (
                <Text style={styles.partyLine} key={i}>
                  {line}
                </Text>
              ))}
            </View>
          ) : (
            <View style={styles.partyCol} />
          )}
        </View>

        {/* Line table */}
        <View style={styles.tableHead}>
          <Text style={[styles.th, styles.cNum]}>#</Text>
          <Text style={[styles.th, styles.cDesc]}>Description</Text>
          <Text style={[styles.th, styles.cQty]}>Qty</Text>
          <Text style={[styles.th, styles.cUnit]}>Unit Price</Text>
          <Text style={[styles.th, styles.cAmt]}>Amount</Text>
        </View>
        {lines.length === 0 ? (
          <View style={styles.row}>
            <Text style={[styles.descText, { paddingLeft: 4 }]}>
              No line items.
            </Text>
          </View>
        ) : (
          lines.map((line, i) => {
            const pct = line.source_pct == null ? null : Number(line.source_pct);
            const isProgress =
              line.source_type === "cost_center" && pct != null && pct < 100;
            return (
              <View style={styles.row} key={line.id} wrap={false}>
                <View style={styles.cNum}>
                  <Text style={styles.refText}>
                    {String(i + 1).padStart(2, "0")}
                  </Text>
                </View>
                <View style={styles.cDesc}>
                  <Text style={styles.descText}>{line.description || "—"}</Text>
                  {isProgress ? (
                    <Text style={styles.drawNote}>
                      ({pct}% progress draw)
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.numCell, styles.cQty]}>
                  {Number(line.quantity)}
                </Text>
                <Text style={[styles.numCell, styles.cUnit]}>
                  {money(Number(line.unit_price))}
                </Text>
                <Text style={[styles.numCell, styles.cAmt]}>
                  {money(Number(line.amount))}
                </Text>
              </View>
            );
          })
        )}

        {/* Totals */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>
              {money(Number(invoice.subtotal))}
            </Text>
          </View>
          <View style={styles.totalsRow}>
            {invoice.tax_exempt ? (
              <>
                <Text style={styles.totalsLabel}>HST exempt</Text>
                <Text style={styles.totalsMuted}>{money(0)}</Text>
              </>
            ) : (
              <>
                <Text style={styles.totalsLabel}>
                  HST ({taxRate.toFixed(taxRate % 1 === 0 ? 0 : 2)}%)
                </Text>
                <Text style={styles.totalsValue}>
                  {money(Number(invoice.tax_amount))}
                </Text>
              </>
            )}
          </View>
          {holdbackRate > 0 ? (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>
                Holdback ({holdbackRate.toFixed(holdbackRate % 1 === 0 ? 0 : 2)}%
                retained)
              </Text>
              <Text style={styles.totalsMuted}>
                − {money(Number(invoice.holdback_amount))}
              </Text>
            </View>
          ) : null}
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Total</Text>
            <Text style={styles.totalsValue}>{money(Number(invoice.total))}</Text>
          </View>
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>Amount Due</Text>
            <Text style={styles.grandValue}>
              {money(Number(invoice.amount_due))}
            </Text>
          </View>
        </View>

        {/* Footer — remit-to + terms + legal line */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerRemit}>
            Please remit payment to {template.legalName}
          </Text>
          <Text style={styles.footerTerms}>
            {invoice.due_date
              ? `Payment due by ${safeDate(invoice.due_date)}.`
              : "Payment due upon receipt."}
            {invoice.currency ? ` All amounts in ${invoice.currency}.` : ""}
          </Text>
          <Text style={styles.footerLegal}>{template.footerLong}</Text>
        </View>
      </Page>
    </Document>
  );
}
