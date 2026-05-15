"use client";

import React from "react";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { format, parseISO } from "date-fns";
import "@/lib/quote-fonts";
import { quoteTotals } from "@/lib/quote-helpers";
import type { QuoteTheme } from "@/lib/quote-themes";
import type { QuoteTemplate } from "@/lib/company-profile";
import type {
  AcceptanceScheduleInstance,
  AgreementScheduleInstance,
  AssuranceScheduleInstance,
  CoverScheduleInstance,
  CustomScheduleInstance,
  ParticularsScheduleInstance,
  QuoteScheduleInstance,
} from "@/lib/quote-schedules";
import { parseRichTextBody } from "@/lib/quote-rich-text";
import type { JSONContent } from "@tiptap/core";
import type { Client, QuoteSection, Site, User } from "@/lib/types";

// ----------------------------------------------------------------------------
// Theme-derived colour helpers
// ----------------------------------------------------------------------------

function mutedFor(theme: QuoteTheme): string {
  return `${theme.ink}99`; // 60% alpha
}

function borderFor(theme: QuoteTheme): string {
  return `${theme.accent}33`; // 20% alpha
}

function ink70(theme: QuoteTheme): string {
  return `${theme.ink}B3`; // 70% alpha
}

// ----------------------------------------------------------------------------
// Schedule numbering utilities
// ----------------------------------------------------------------------------

function toRomanNumeral(n: number): string {
  if (n <= 0) return "";
  const pairs: Array<[number, string]> = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  let rem = n;
  for (const [value, sym] of pairs) {
    while (rem >= value) {
      out += sym;
      rem -= value;
    }
  }
  return out;
}

function getScheduleRomanForIndex(
  schedules: QuoteScheduleInstance[],
  index: number
): string | null {
  const s = schedules[index];
  if (s.kind === "cover" || s.kind === "acceptance") return null;
  let count = 0;
  for (let i = 0; i < index; i++) {
    const k = schedules[i].kind;
    if (k !== "cover" && k !== "acceptance") count++;
  }
  return toRomanNumeral(count + 1);
}

function getScheduleFooterLabel(
  schedules: QuoteScheduleInstance[],
  index: number
): string {
  const s = schedules[index];
  if (s.kind === "cover") return "";
  if (s.kind === "acceptance") return "Acceptance";
  return `Schedule ${getScheduleRomanForIndex(schedules, index)}`;
}

function pageStamp(n: number, total: number): string {
  return `${String(n).padStart(2, "0")}/${String(total).padStart(2, "0")}`;
}

// Section index → letter prefix for Particulars REF column. Predictable;
// avoids collisions when two sections start with the same name letter.
function sectionLetterPrefix(index: number): string {
  if (index < 0) return "X";
  // 0 → A, 1 → B, …, 25 → Z, 26 → AA, etc.
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

function safeFormat(iso: string, fmt: string): string {
  try {
    return format(parseISO(iso), fmt);
  } catch {
    return iso;
  }
}

// ----------------------------------------------------------------------------
// Style factory — rebuilds on each render, parameterised by theme.
// ----------------------------------------------------------------------------

type Styles = ReturnType<typeof createStyles>;

function createStyles(theme: QuoteTheme) {
  return StyleSheet.create({
    page: {
      fontFamily: "Inter",
      backgroundColor: theme.ambience,
      paddingHorizontal: 56,
      paddingVertical: 56,
      paddingBottom: 80,
      fontSize: 9,
      color: theme.ink,
    },

    // ----- Logo slots -----
    logoCover: {
      width: 80,
      height: 80,
      alignSelf: "center",
      marginBottom: 14,
    },
    logoFooterMark: {
      width: 12,
      height: 12,
      opacity: 0,
    },

    // ----- Shared page header (non-cover pages) -----
    pageHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 18,
    },
    pageHeaderText: {
      fontFamily: "Inter",
      fontSize: 7,
      color: theme.accent,
      letterSpacing: 1,
    },
    pageHeaderCenter: {
      fontFamily: "Cormorant Garamond",
      fontSize: 10,
      color: theme.accent,
    },

    // ----- Single accent rule with centered ornament -----
    ruleWithOrnamentRow: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: 10,
    },
    ruleLine: {
      flex: 1,
      borderBottomWidth: 0.4,
      borderBottomColor: theme.accent,
    },
    ruleOrnament: {
      fontFamily: "Cormorant Garamond",
      fontSize: 10,
      color: theme.accent,
      paddingHorizontal: 8,
    },
    ruleOrnamentSparkle: {
      fontFamily: "Cormorant Garamond",
      fontSize: 11,
      color: theme.accent,
      paddingHorizontal: 8,
    },

    // ----- Schedule title pair (subtitle + giant title) -----
    scheduleSubtitle: {
      fontFamily: "Inter",
      fontSize: 9,
      color: theme.accent,
      letterSpacing: 3,
      textTransform: "uppercase",
      textAlign: "center",
      marginTop: 4,
      marginBottom: 6,
    },
    scheduleTitle: {
      fontFamily: "Cormorant Garamond",
      fontStyle: "italic",
      fontSize: 48,
      color: theme.accent,
      textAlign: "center",
      marginBottom: 12,
    },

    // ----- Cover page -----
    coverPage: {
      fontFamily: "Inter",
      backgroundColor: theme.ambience,
      paddingHorizontal: 64,
      paddingVertical: 56,
      paddingBottom: 80,
      fontSize: 9,
      color: theme.ink,
    },
    coverBrandBlock: {
      alignItems: "center",
      marginVertical: 10,
    },
    coverBrandMark: {
      fontFamily: "Cormorant Garamond",
      fontWeight: "bold",
      fontSize: 36,
      color: theme.accent,
      letterSpacing: 4,
      textAlign: "center",
    },
    coverBrandSub: {
      fontFamily: "Inter",
      fontWeight: "medium",
      fontSize: 11,
      color: theme.accent,
      letterSpacing: 6,
      textTransform: "uppercase",
      textAlign: "center",
      marginTop: 6,
    },
    coverTagline: {
      fontFamily: "Cormorant Garamond",
      fontStyle: "italic",
      fontSize: 10,
      color: ink70(theme),
      textAlign: "center",
      marginTop: 6,
    },
    coverSubtitle: {
      fontFamily: "Inter",
      fontSize: 9,
      color: theme.accent,
      letterSpacing: 3,
      textTransform: "uppercase",
      textAlign: "center",
      marginTop: 4,
    },
    coverTitle: {
      fontFamily: "Cormorant Garamond",
      fontStyle: "italic",
      fontSize: 48,
      color: theme.accent,
      textAlign: "center",
      marginTop: 4,
      marginBottom: 6,
    },
    coverDateLine: {
      fontFamily: "Cormorant Garamond",
      fontStyle: "italic",
      fontSize: 10,
      color: ink70(theme),
      textAlign: "center",
      marginBottom: 18,
    },
    coverTwoCol: {
      flexDirection: "row",
      marginVertical: 14,
    },
    coverColLeft: {
      flex: 1,
      paddingRight: 14,
    },
    coverColRight: {
      flex: 1,
      paddingLeft: 14,
      borderLeftWidth: 0.4,
      borderLeftColor: theme.accent,
    },
    coverColDiamond: {
      fontFamily: "Cormorant Garamond",
      fontSize: 8,
      color: theme.accent,
      textAlign: "center",
    },
    coverColLabel: {
      fontFamily: "Inter",
      fontSize: 7,
      color: theme.accent,
      letterSpacing: 2,
      textTransform: "uppercase",
      marginBottom: 4,
    },
    coverColTitle: {
      fontFamily: "Cormorant Garamond",
      fontSize: 14,
      color: theme.ink,
      marginBottom: 2,
    },
    coverColText: {
      fontFamily: "Cormorant Garamond",
      fontStyle: "italic",
      fontSize: 9,
      color: ink70(theme),
      lineHeight: 1.45,
    },
    coverMetaRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginVertical: 10,
    },
    coverMetaCol: {
      flex: 1,
      paddingHorizontal: 4,
    },
    coverMetaLabel: {
      fontFamily: "Inter",
      fontSize: 7,
      color: theme.accent,
      letterSpacing: 2,
      textTransform: "uppercase",
      marginBottom: 3,
    },
    coverMetaValue: {
      fontFamily: "Cormorant Garamond",
      fontStyle: "italic",
      fontSize: 11,
      color: theme.ink,
    },
    coverScopeLabel: {
      fontFamily: "Inter",
      fontSize: 9,
      color: theme.accent,
      letterSpacing: 3,
      textTransform: "uppercase",
      textAlign: "center",
      marginTop: 10,
      marginBottom: 6,
    },
    coverScopeRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginTop: 4,
    },
    coverScopeDropCap: {
      fontFamily: "Cormorant Garamond",
      fontSize: 36,
      color: theme.accent,
      lineHeight: 1,
      paddingRight: 6,
      marginTop: -4,
    },
    coverScopeBody: {
      flex: 1,
      fontFamily: "Cormorant Garamond",
      fontSize: 10,
      color: theme.ink,
      lineHeight: 1.55,
      textAlign: "justify",
    },

    // ----- Particulars page -----
    partSectionHeader: {
      fontFamily: "Inter",
      fontSize: 9,
      color: theme.accent,
      letterSpacing: 2,
      textTransform: "uppercase",
      marginTop: 10,
      marginBottom: 4,
    },
    partTableHead: {
      flexDirection: "row",
      paddingVertical: 5,
      borderBottomWidth: 0.6,
      borderBottomColor: theme.accent,
    },
    partTableHeadText: {
      fontFamily: "Inter",
      fontSize: 7,
      color: mutedFor(theme),
      letterSpacing: 0.6,
      textTransform: "uppercase",
    },
    partRow: {
      flexDirection: "row",
      paddingVertical: 5,
      borderBottomWidth: 0.4,
      borderBottomColor: borderFor(theme),
    },
    partCellRef: { width: "10%", paddingRight: 4 },
    partCellDesc: { width: "60%", paddingRight: 6 },
    partCellQty: { width: "10%", textAlign: "right" },
    partCellUnitPrice: { width: "10%", textAlign: "right" },
    partCellAmount: { width: "20%", textAlign: "right" },
    partCellAmountWithUnit: { width: "10%", textAlign: "right" },
    partRefText: {
      fontFamily: "Cormorant Garamond",
      fontStyle: "italic",
      fontSize: 9,
      color: theme.accent,
    },
    partDescText: {
      fontFamily: "Cormorant Garamond",
      fontSize: 9.5,
      color: theme.ink,
    },
    partDescSku: {
      fontFamily: "Inter",
      fontSize: 7,
      color: mutedFor(theme),
      marginTop: 1,
    },
    partNumText: {
      fontFamily: "Inter",
      fontSize: 9,
      color: theme.ink,
    },
    partRule: {
      borderBottomWidth: 0.6,
      borderBottomColor: theme.accent,
      marginTop: 8,
    },
    partTotalsBlock: {
      marginTop: 14,
      marginLeft: "auto",
      width: 260,
    },
    partTotalsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 2,
    },
    partTotalsLabel: {
      fontFamily: "Inter",
      fontSize: 9,
      color: theme.ink,
    },
    partTotalsValue: {
      fontFamily: "Inter",
      fontSize: 9,
      color: theme.ink,
    },
    partGrandRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      paddingTop: 8,
      marginTop: 4,
      borderTopWidth: 0.6,
      borderTopColor: theme.accent,
    },
    partGrandLabel: {
      fontFamily: "Cormorant Garamond",
      fontStyle: "italic",
      fontSize: 10,
      color: ink70(theme),
      paddingBottom: 6,
    },
    partGrandValue: {
      fontFamily: "Cormorant Garamond",
      fontSize: 42,
      color: theme.accent,
    },

    // ----- Agreement page -----
    agreementLine: {
      fontFamily: "Cormorant Garamond",
      fontSize: 10,
      color: theme.ink,
      lineHeight: 1.5,
      marginBottom: 6,
    },

    // ----- Acceptance page -----
    acceptBox: {
      flexDirection: "row",
      borderWidth: 1,
      borderColor: theme.accent,
      padding: 16,
      marginTop: 14,
      marginBottom: 18,
    },
    acceptBoxLeft: {
      flex: 1,
      justifyContent: "center",
    },
    acceptBoxRight: {
      width: 180,
      alignItems: "flex-end",
    },
    acceptQuoteLine: {
      fontFamily: "Cormorant Garamond",
      fontSize: 10,
      color: theme.ink,
    },
    acceptValidLine: {
      fontFamily: "Cormorant Garamond",
      fontStyle: "italic",
      fontSize: 9,
      color: ink70(theme),
      marginTop: 2,
    },
    acceptTotalLabel: {
      fontFamily: "Inter",
      fontSize: 7,
      color: theme.accent,
      letterSpacing: 2,
      textTransform: "uppercase",
    },
    acceptTotalValue: {
      fontFamily: "Cormorant Garamond",
      fontSize: 30,
      color: theme.accent,
      marginTop: 2,
    },
    acceptHeading: {
      fontFamily: "Inter",
      fontSize: 9,
      color: theme.accent,
      letterSpacing: 3,
      textTransform: "uppercase",
      textAlign: "center",
      marginTop: 14,
      marginBottom: 14,
    },
    acceptSigRow: {
      flexDirection: "row",
      marginVertical: 10,
    },
    acceptSigCol: {
      flex: 1,
      paddingHorizontal: 8,
    },
    acceptSigColTitle: {
      fontFamily: "Inter",
      fontSize: 7,
      color: theme.accent,
      letterSpacing: 2,
      textTransform: "uppercase",
      marginBottom: 6,
    },
    acceptSigClientName: {
      fontFamily: "Cormorant Garamond",
      fontStyle: "italic",
      fontSize: 11,
      color: theme.ink,
      marginBottom: 4,
    },
    acceptSigHouse: {
      fontFamily: "Cormorant Garamond",
      fontStyle: "italic",
      fontSize: 11,
      color: theme.accent,
      marginBottom: 4,
    },
    acceptSigLineRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 24,
    },
    acceptSigLine: {
      height: 22,
      borderBottomWidth: 0.6,
      borderBottomColor: theme.ink,
      width: "70%",
    },
    acceptSigDateLine: {
      height: 22,
      borderBottomWidth: 0.6,
      borderBottomColor: theme.ink,
      width: "25%",
    },
    acceptSigLineLabels: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 2,
    },
    acceptSigLabel: {
      fontFamily: "Inter",
      fontSize: 7,
      color: theme.accent,
      letterSpacing: 1.5,
      textTransform: "uppercase",
    },
    acceptSigSubLine: {
      fontFamily: "Cormorant Garamond",
      fontStyle: "italic",
      fontSize: 9,
      color: ink70(theme),
      marginTop: 12,
    },
    acceptRule: {
      borderBottomWidth: 0.6,
      borderBottomColor: theme.accent,
      marginTop: 14,
    },

    // ----- Custom page (rich text) -----
    customParagraph: {
      fontFamily: "Cormorant Garamond",
      fontSize: 10,
      color: theme.ink,
      lineHeight: 1.5,
      marginVertical: 2,
    },
    customHeading2: {
      fontFamily: "Cormorant Garamond",
      fontSize: 16,
      fontWeight: "bold",
      color: theme.accent,
      lineHeight: 1.3,
      marginTop: 8,
      marginBottom: 3,
    },
    customHeading3: {
      fontFamily: "Cormorant Garamond",
      fontSize: 12,
      fontWeight: "bold",
      color: theme.ink,
      lineHeight: 1.3,
      marginTop: 5,
      marginBottom: 2,
    },
    customList: {
      marginVertical: 4,
    },
    customListItem: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginVertical: 1,
    },
    customListBullet: {
      fontFamily: "Cormorant Garamond",
      fontSize: 10,
      color: theme.accent,
      width: 16,
      marginRight: 4,
    },
    customListContent: {
      flex: 1,
    },

    // ----- Assurance page (warranty / service tier cards) -----
    assuranceGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      marginTop: 12,
    },
    assuranceCard: {
      width: "48%",
      borderWidth: 1,
      borderColor: theme.accent,
      borderRadius: 2,
      paddingVertical: 24,
      paddingHorizontal: 28,
      marginBottom: 16,
      alignItems: "center",
    },
    assuranceCardOrnament: {
      fontFamily: "Cormorant Garamond",
      fontSize: 24,
      color: theme.accent,
      marginBottom: 8,
    },
    assuranceCardTier: {
      fontFamily: "Inter",
      fontSize: 8,
      color: theme.accent,
      letterSpacing: 4,
      marginBottom: 6,
    },
    assuranceCardTitle: {
      fontFamily: "Cormorant Garamond",
      fontSize: 18,
      fontStyle: "italic",
      color: theme.ink,
      marginBottom: 6,
      textAlign: "center",
    },
    assuranceCardDescription: {
      fontFamily: "Cormorant Garamond",
      fontSize: 10,
      color: `${theme.ink}CC`,
      lineHeight: 1.4,
      textAlign: "center",
    },

    // ----- Agreement page: "Pray Observe · Not Included" block -----
    prayObserveBlock: {
      alignItems: "center",
      marginBottom: 24,
    },
    prayObserveOrnament: {
      fontFamily: "Cormorant Garamond",
      fontSize: 12,
      color: theme.accent,
      marginBottom: 6,
    },
    prayObserveHeader: {
      fontFamily: "Inter",
      fontSize: 9,
      color: theme.accent,
      letterSpacing: 4,
      textAlign: "center",
      marginBottom: 4,
    },
    prayObserveSubtitle: {
      fontFamily: "Cormorant Garamond",
      fontSize: 9,
      fontStyle: "italic",
      color: `${theme.ink}AA`,
      textAlign: "center",
      marginBottom: 14,
    },
    prayObserveGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      width: "100%",
    },
    prayObserveItem: {
      width: "48%",
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 8,
    },
    prayObserveX: {
      fontFamily: "Cormorant Garamond",
      fontSize: 10,
      color: theme.accent,
      marginRight: 6,
      marginTop: 1,
    },
    prayObserveText: {
      fontFamily: "Cormorant Garamond",
      fontSize: 10,
      color: theme.ink,
      lineHeight: 1.4,
      flex: 1,
    },
    prayObserveSpacer: {
      height: 16,
    },

    // ----- Shared footer (fixed at bottom of every page) -----
    sharedFooter: {
      position: "absolute",
      bottom: 32,
      left: 56,
      right: 56,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    footerLeft: {
      fontFamily: "Inter",
      fontSize: 7,
      color: theme.accent,
      letterSpacing: 1,
    },
    footerCenter: {
      fontFamily: "Cormorant Garamond",
      fontSize: 8,
      color: theme.accent,
    },
    footerRight: {
      fontFamily: "Inter",
      fontSize: 7,
      color: theme.accent,
      letterSpacing: 1,
      textAlign: "right",
    },
    footerLegalLine: {
      position: "absolute",
      bottom: 50,
      left: 56,
      right: 56,
      fontFamily: "Inter",
      fontSize: 7,
      color: theme.accent,
      letterSpacing: 1,
      textAlign: "right",
    },
  });
}

// ----------------------------------------------------------------------------
// Reusable inline pieces
// ----------------------------------------------------------------------------

function LogoSlot({
  variant,
  styles,
}: {
  variant: "cover" | "footer-mark";
  styles: Styles;
}) {
  return (
    <View style={variant === "cover" ? styles.logoCover : styles.logoFooterMark} />
  );
}

function RuleWithOrnament({
  styles,
  ornament,
  sparkle,
}: {
  styles: Styles;
  ornament?: string;
  sparkle?: boolean;
}) {
  return (
    <View style={styles.ruleWithOrnamentRow}>
      <View style={styles.ruleLine} />
      <Text style={sparkle ? styles.ruleOrnamentSparkle : styles.ruleOrnament}>
        {ornament ?? "❦"}
      </Text>
      <View style={styles.ruleLine} />
    </View>
  );
}

function PageHeader({
  styles,
  template,
  number,
  pageNumber,
  totalPages,
}: {
  styles: Styles;
  template: QuoteTemplate;
  number: string;
  pageNumber: number;
  totalPages: number;
}) {
  return (
    <View style={styles.pageHeader} fixed>
      <Text style={styles.pageHeaderText}>{template.footerShort}</Text>
      <Text style={styles.pageHeaderCenter}>{"❦"}</Text>
      <Text style={styles.pageHeaderText}>
        {number} · {pageStamp(pageNumber, totalPages)}
      </Text>
    </View>
  );
}

function SharedFooter({
  styles,
  template,
  number,
  pageNumber,
  totalPages,
  footerLabel,
  legalLine,
}: {
  styles: Styles;
  template: QuoteTemplate;
  number: string;
  pageNumber: number;
  totalPages: number;
  footerLabel: string;
  legalLine?: string;
}) {
  const right =
    `${number}` +
    (footerLabel ? ` · ${footerLabel}` : "") +
    ` ${pageStamp(pageNumber, totalPages)}`;
  return (
    <>
      {legalLine ? (
        <Text style={styles.footerLegalLine} fixed>
          {legalLine}
        </Text>
      ) : null}
      <View style={styles.sharedFooter} fixed>
        <Text style={styles.footerLeft}>{template.footerShort}</Text>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={styles.footerCenter}>{"❦"}</Text>
          <LogoSlot variant="footer-mark" styles={styles} />
        </View>
        <Text style={styles.footerRight}>{right}</Text>
      </View>
    </>
  );
}

// ----------------------------------------------------------------------------
// Page renderers
// ----------------------------------------------------------------------------

interface CommonPageProps {
  pageNumber: number;
  totalPages: number;
  footerLabel: string;
  romanForTitle: string | null;
  theme: QuoteTheme;
  template: QuoteTemplate;
  styles: Styles;
  number: string;
  name?: string;
}

interface CoverPageProps extends CommonPageProps {
  schedule: CoverScheduleInstance;
  createdAt: string;
  validUntil: string;
  paymentTerms: string;
  client?: Client;
  site?: Site;
  owner?: User;
}

function CoverPage({
  schedule,
  pageNumber,
  totalPages,
  footerLabel,
  styles,
  template,
  number,
  createdAt,
  validUntil,
  paymentTerms,
  client,
  site,
  owner,
}: CoverPageProps) {
  const scope = schedule.scopeOfWorks?.trim() ?? "";
  const dropCap = scope.length > 0 ? scope.charAt(0) : "";
  const dropBody = scope.length > 0 ? scope.slice(1) : "";

  return (
    <Page size="LETTER" style={styles.coverPage} wrap>
      <LogoSlot variant="cover" styles={styles} />
      <RuleWithOrnament styles={styles} />

      <View style={styles.coverBrandBlock}>
        <Text style={styles.coverBrandMark}>{template.brandMark}</Text>
        <Text style={styles.coverBrandSub}>{template.brandSub}</Text>
        <Text style={styles.coverTagline}>{template.tagline}</Text>
      </View>

      <RuleWithOrnament styles={styles} />

      <Text style={styles.coverSubtitle}>{schedule.subtitle}</Text>
      <Text style={styles.coverTitle}>{schedule.title}</Text>
      <Text style={styles.coverDateLine}>
        numbered {number}, dated {safeFormat(createdAt, "MMMM d, yyyy")}
      </Text>

      <View style={styles.coverTwoCol}>
        <View style={styles.coverColLeft}>
          <Text style={styles.coverColLabel}>For</Text>
          {client ? (
            <View>
              <Text style={styles.coverColTitle}>{client.name}</Text>
              {client.contactName ? (
                <Text style={styles.coverColText}>{client.contactName}</Text>
              ) : null}
              {client.address ? (
                <Text style={styles.coverColText}>{client.address}</Text>
              ) : null}
              {(client.city || client.state) && (
                <Text style={styles.coverColText}>
                  {client.city}
                  {client.city && client.state ? ", " : ""}
                  {client.state}
                </Text>
              )}
              {client.email ? (
                <Text style={styles.coverColText}>{client.email}</Text>
              ) : null}
            </View>
          ) : (
            <Text style={styles.coverColText}>Client to be assigned</Text>
          )}
        </View>
        <View style={styles.coverColRight}>
          <Text style={styles.coverColDiamond}>{"◆"}</Text>
          <Text style={styles.coverColLabel}>At the Site of</Text>
          {site ? (
            <View>
              <Text style={styles.coverColTitle}>{site.name}</Text>
              {site.address ? (
                <Text style={styles.coverColText}>{site.address}</Text>
              ) : null}
              {(site.city || site.state) && (
                <Text style={styles.coverColText}>
                  {site.city}
                  {site.city && site.state ? ", " : ""}
                  {site.state}
                </Text>
              )}
            </View>
          ) : (
            <Text style={styles.coverColText}>Site to be assigned</Text>
          )}
          <Text style={[styles.coverColDiamond, { marginTop: 8 }]}>
            {"◆"}
          </Text>
        </View>
      </View>

      <View style={styles.partRule} />

      <View style={styles.coverMetaRow}>
        <View style={styles.coverMetaCol}>
          <Text style={styles.coverMetaLabel}>Issued</Text>
          <Text style={styles.coverMetaValue}>
            {safeFormat(createdAt, "MMMM d, yyyy")}
          </Text>
        </View>
        <View style={styles.coverMetaCol}>
          <Text style={styles.coverMetaLabel}>Valid Until</Text>
          <Text style={styles.coverMetaValue}>
            {safeFormat(validUntil, "MMMM d, yyyy")}
          </Text>
        </View>
        <View style={styles.coverMetaCol}>
          <Text style={styles.coverMetaLabel}>Terms</Text>
          <Text style={styles.coverMetaValue}>{paymentTerms}</Text>
        </View>
        <View style={styles.coverMetaCol}>
          <Text style={styles.coverMetaLabel}>Prepared By</Text>
          <Text style={styles.coverMetaValue}>{owner?.name ?? "—"}</Text>
        </View>
      </View>

      <RuleWithOrnament styles={styles} ornament={"◆"} />

      {scope.length > 0 ? (
        <View>
          <Text style={styles.coverScopeLabel}>The Scope of Works</Text>
          <View style={styles.coverScopeRow}>
            <Text style={styles.coverScopeDropCap}>{dropCap}</Text>
            <Text style={styles.coverScopeBody}>{dropBody}</Text>
          </View>
        </View>
      ) : null}

      <SharedFooter
        styles={styles}
        template={template}
        number={number}
        pageNumber={pageNumber}
        totalPages={totalPages}
        footerLabel={footerLabel}
      />
    </Page>
  );
}

interface ParticularsPageProps extends CommonPageProps {
  schedule: ParticularsScheduleInstance;
  sections: QuoteSection[];
  taxRatePct: number;
  discount: number;
  discountType: "pct" | "amount";
  showUnitPrice: boolean;
}

function ParticularsPage({
  schedule,
  pageNumber,
  totalPages,
  footerLabel,
  romanForTitle,
  styles,
  template,
  number,
  sections,
  taxRatePct,
  discount,
  discountType,
  showUnitPrice,
}: ParticularsPageProps) {
  const totals = quoteTotals(sections, taxRatePct / 100, discount, discountType);
  const subtitleSuffix = schedule.subtitle || "Bill of Materials";
  const renderableSections = sections.filter((s) => s.items.length > 0);

  return (
    <Page size="LETTER" style={styles.page} wrap>
      <PageHeader
        styles={styles}
        template={template}
        number={number}
        pageNumber={pageNumber}
        totalPages={totalPages}
      />
      <RuleWithOrnament styles={styles} />

      <Text style={styles.scheduleSubtitle}>
        Schedule {romanForTitle} · {subtitleSuffix}
      </Text>
      <Text style={styles.scheduleTitle}>{schedule.title}</Text>

      <RuleWithOrnament styles={styles} ornament={"✦"} sparkle />

      {renderableSections.map((s, sectionIdx) => {
        const prefix = sectionLetterPrefix(sectionIdx);
        return (
          <View key={s.id} wrap={false}>
            <Text style={styles.partSectionHeader}>{s.name.toUpperCase()}</Text>
            <View style={styles.partTableHead}>
              <Text style={[styles.partTableHeadText, styles.partCellRef]}>Ref</Text>
              <Text style={[styles.partTableHeadText, styles.partCellDesc]}>
                Description
              </Text>
              <Text style={[styles.partTableHeadText, styles.partCellQty]}>Qty</Text>
              {showUnitPrice ? (
                <Text style={[styles.partTableHeadText, styles.partCellUnitPrice]}>
                  Unit Price
                </Text>
              ) : null}
              <Text
                style={[
                  styles.partTableHeadText,
                  showUnitPrice
                    ? styles.partCellAmountWithUnit
                    : styles.partCellAmount,
                ]}
              >
                Amount
              </Text>
            </View>
            {s.items.map((it, itemIdx) => {
              const isLabor = it.type === "labor";
              const amount = isLabor
                ? (it.hours ?? 0) * (it.rate ?? 0)
                : it.qty * it.unitPrice;
              const unit = isLabor ? (it.rate ?? 0) : it.unitPrice;
              const qty = isLabor
                ? `${it.hours ?? 0} hrs`
                : it.qty.toString();
              const ref = `${prefix}.${String(itemIdx + 1).padStart(2, "0")}`;
              return (
                <View style={styles.partRow} key={it.id}>
                  <View style={styles.partCellRef}>
                    <Text style={styles.partRefText}>{ref}</Text>
                  </View>
                  <View style={styles.partCellDesc}>
                    <Text style={styles.partDescText}>{it.description || "—"}</Text>
                    {!isLabor && it.sku ? (
                      <Text style={styles.partDescSku}>
                        SKU {it.sku}
                        {it.vendor ? ` · ${it.vendor}` : ""}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.partNumText, styles.partCellQty]}>{qty}</Text>
                  {showUnitPrice ? (
                    <Text style={[styles.partNumText, styles.partCellUnitPrice]}>
                      {usd(unit)}
                    </Text>
                  ) : null}
                  <Text
                    style={[
                      styles.partNumText,
                      showUnitPrice
                        ? styles.partCellAmountWithUnit
                        : styles.partCellAmount,
                    ]}
                  >
                    {usd(amount)}
                  </Text>
                </View>
              );
            })}
          </View>
        );
      })}

      <View style={styles.partRule} />

      <View style={styles.partTotalsBlock}>
        <View style={styles.partTotalsRow}>
          <Text style={styles.partTotalsLabel}>Subtotal</Text>
          <Text style={styles.partTotalsValue}>{usd(totals.subtotal)}</Text>
        </View>
        {totals.discountAmount > 0 ? (
          <View style={styles.partTotalsRow}>
            <Text style={styles.partTotalsLabel}>Discount</Text>
            <Text style={styles.partTotalsValue}>
              −{usd(totals.discountAmount)}
            </Text>
          </View>
        ) : null}
        <View style={styles.partTotalsRow}>
          <Text style={styles.partTotalsLabel}>
            HST ({taxRatePct.toFixed(2)}%)
          </Text>
          <Text style={styles.partTotalsValue}>{usd(totals.tax)}</Text>
        </View>
        <View style={styles.partGrandRow}>
          <Text style={styles.partGrandLabel}>Total, in Canadian Dollars</Text>
          <Text style={styles.partGrandValue}>{usd(totals.total)}</Text>
        </View>
      </View>

      <SharedFooter
        styles={styles}
        template={template}
        number={number}
        pageNumber={pageNumber}
        totalPages={totalPages}
        footerLabel={footerLabel}
      />
    </Page>
  );
}

interface AgreementPageProps extends CommonPageProps {
  schedule: AgreementScheduleInstance;
  terms: string;
}

function AgreementPage({
  schedule,
  pageNumber,
  totalPages,
  footerLabel,
  romanForTitle,
  styles,
  template,
  number,
  terms,
}: AgreementPageProps) {
  const subtitleSuffix = schedule.subtitle || "Terms & Conditions";
  const lines = terms.split("\n");
  const exclusions = schedule.exclusions ?? [];
  return (
    <Page size="LETTER" style={styles.page} wrap>
      <PageHeader
        styles={styles}
        template={template}
        number={number}
        pageNumber={pageNumber}
        totalPages={totalPages}
      />

      {exclusions.length > 0 && (
        <View style={styles.prayObserveBlock}>
          <Text style={styles.prayObserveOrnament}>{"◆"}</Text>
          <Text style={styles.prayObserveHeader}>
            PRAY OBSERVE · NOT INCLUDED IN THIS QUOTATION
          </Text>
          <Text style={styles.prayObserveSubtitle}>
            The following are by others unless added in writing.
          </Text>
          <View style={styles.prayObserveGrid}>
            {exclusions.map((ex) => (
              <View key={ex.id} style={styles.prayObserveItem}>
                <Text style={styles.prayObserveX}>{"×"}</Text>
                <Text style={styles.prayObserveText}>{ex.text}</Text>
              </View>
            ))}
          </View>
          <View style={styles.prayObserveSpacer} />
        </View>
      )}

      <RuleWithOrnament styles={styles} />

      <Text style={styles.scheduleSubtitle}>
        Schedule {romanForTitle} · {subtitleSuffix}
      </Text>
      <Text style={styles.scheduleTitle}>{schedule.title}</Text>

      <RuleWithOrnament styles={styles} />

      {lines.map((line, i) => (
        <Text style={styles.agreementLine} key={i}>
          {line || " "}
        </Text>
      ))}

      <SharedFooter
        styles={styles}
        template={template}
        number={number}
        pageNumber={pageNumber}
        totalPages={totalPages}
        footerLabel={footerLabel}
      />
    </Page>
  );
}

interface AcceptancePagePropsExt extends CommonPageProps {
  schedule: AcceptanceScheduleInstance;
  client?: Client;
  owner?: User;
  validUntil: string;
  sections: QuoteSection[];
  taxRatePct: number;
  discount: number;
  discountType: "pct" | "amount";
}

function AcceptancePage({
  pageNumber,
  totalPages,
  footerLabel,
  styles,
  template,
  number,
  client,
  owner,
  validUntil,
  sections,
  taxRatePct,
  discount,
  discountType,
}: AcceptancePagePropsExt) {
  const totals = quoteTotals(sections, taxRatePct / 100, discount, discountType);
  return (
    <Page size="LETTER" style={styles.page} wrap>
      <PageHeader
        styles={styles}
        template={template}
        number={number}
        pageNumber={pageNumber}
        totalPages={totalPages}
      />
      <RuleWithOrnament styles={styles} />

      <Text style={styles.scheduleSubtitle}>For Acceptance</Text>

      <View style={styles.acceptBox}>
        <View style={styles.acceptBoxLeft}>
          <Text style={styles.acceptQuoteLine}>Quotation {number}</Text>
          <Text style={styles.acceptValidLine}>
            valid until {safeFormat(validUntil, "MMMM d, yyyy")}
          </Text>
        </View>
        <View style={styles.acceptBoxRight}>
          <Text style={styles.acceptTotalLabel}>Total · CAD</Text>
          <Text style={styles.acceptTotalValue}>{usd(totals.total)}</Text>
        </View>
      </View>

      <RuleWithOrnament styles={styles} />

      <Text style={styles.acceptHeading}>Witnessed & Agreed</Text>

      <View style={styles.acceptSigRow}>
        <View style={styles.acceptSigCol}>
          <Text style={styles.acceptSigColTitle}>For the Client</Text>
          <Text style={styles.acceptSigClientName}>
            {client?.name ?? "—"}
          </Text>
          <View style={styles.acceptSigLineRow}>
            <View style={styles.acceptSigLine} />
            <View style={styles.acceptSigDateLine} />
          </View>
          <View style={styles.acceptSigLineLabels}>
            <Text style={styles.acceptSigLabel}>Signature</Text>
            <Text style={styles.acceptSigLabel}>Date</Text>
          </View>
          <Text style={styles.acceptSigSubLine}>Printed Name</Text>
          <Text style={styles.acceptSigSubLine}>Title</Text>
        </View>

        <View style={styles.acceptSigCol}>
          <Text style={styles.acceptSigColTitle}>For the House of</Text>
          <Text style={styles.acceptSigHouse}>
            {template.footerShort.toUpperCase()}
          </Text>
          <View style={styles.acceptSigLineRow}>
            <View style={styles.acceptSigLine} />
            <View style={styles.acceptSigDateLine} />
          </View>
          <View style={styles.acceptSigLineLabels}>
            <Text style={styles.acceptSigLabel}>Signature</Text>
            <Text style={styles.acceptSigLabel}>Date</Text>
          </View>
          <Text style={styles.acceptSigSubLine}>
            {owner?.name ?? "Printed Name"}
          </Text>
          <Text style={styles.acceptSigSubLine}>
            Vice President, {template.legalName}
          </Text>
        </View>
      </View>

      <View style={styles.acceptRule} />

      <SharedFooter
        styles={styles}
        template={template}
        number={number}
        pageNumber={pageNumber}
        totalPages={totalPages}
        footerLabel={footerLabel}
        legalLine={template.footerLong}
      />
    </Page>
  );
}

// ----------------------------------------------------------------------------
// Rich-text walker for CustomPage bodies
// ----------------------------------------------------------------------------

function renderRichTextInline(
  nodes: JSONContent[] | undefined,
): React.ReactNode {
  if (!nodes) return null;
  return nodes.map((n, i) => {
    if (n.type !== "text") return null;
    const text = n.text ?? "";
    const marks = n.marks ?? [];
    const inline: { fontWeight?: "bold"; fontStyle?: "italic" } = {};
    if (marks.some((m) => m.type === "bold")) inline.fontWeight = "bold";
    if (marks.some((m) => m.type === "italic")) inline.fontStyle = "italic";
    return (
      <Text key={i} style={inline}>
        {text}
      </Text>
    );
  });
}

function renderRichTextBlock(
  node: JSONContent,
  styles: Styles,
  key: number,
): React.ReactNode {
  switch (node.type) {
    case "paragraph":
      return (
        <Text key={key} style={styles.customParagraph}>
          {renderRichTextInline(node.content)}
        </Text>
      );
    case "heading": {
      const level = (node.attrs?.level as number) ?? 2;
      const style = level === 2 ? styles.customHeading2 : styles.customHeading3;
      return (
        <Text key={key} style={style}>
          {renderRichTextInline(node.content)}
        </Text>
      );
    }
    case "bulletList":
    case "orderedList": {
      const ordered = node.type === "orderedList";
      return (
        <View key={key} style={styles.customList}>
          {(node.content ?? []).map((item, i) => (
            <View key={i} style={styles.customListItem}>
              <Text style={styles.customListBullet}>
                {ordered ? `${i + 1}.` : "•"}
              </Text>
              <View style={styles.customListContent}>
                {(item.content ?? []).map((child, j) =>
                  renderRichTextBlock(child, styles, j),
                )}
              </View>
            </View>
          ))}
        </View>
      );
    }
    default:
      return (
        <Text key={key} style={styles.customParagraph}>
          {renderRichTextInline(node.content)}
        </Text>
      );
  }
}

interface AssurancePageProps extends CommonPageProps {
  schedule: AssuranceScheduleInstance;
}

function AssurancePage({
  schedule,
  pageNumber,
  totalPages,
  footerLabel,
  romanForTitle,
  styles,
  template,
  number,
}: AssurancePageProps) {
  const subtitleSuffix = schedule.subtitle || "Warranty & Service";
  return (
    <Page size="LETTER" style={styles.page} wrap>
      <PageHeader
        styles={styles}
        template={template}
        number={number}
        pageNumber={pageNumber}
        totalPages={totalPages}
      />
      <RuleWithOrnament styles={styles} />

      <Text style={styles.scheduleSubtitle}>
        Schedule {romanForTitle} · {subtitleSuffix.toUpperCase()}
      </Text>
      <Text style={styles.scheduleTitle}>{schedule.title}</Text>

      <RuleWithOrnament styles={styles} />

      <View style={styles.assuranceGrid}>
        {schedule.cards.map((card) => (
          <View key={card.id} style={styles.assuranceCard} wrap={false}>
            <Text style={styles.assuranceCardOrnament}>{card.ornament}</Text>
            <Text style={styles.assuranceCardTier}>{card.tier}</Text>
            <Text style={styles.assuranceCardTitle}>{card.title}</Text>
            <Text style={styles.assuranceCardDescription}>
              {card.description}
            </Text>
          </View>
        ))}
      </View>

      <SharedFooter
        styles={styles}
        template={template}
        number={number}
        pageNumber={pageNumber}
        totalPages={totalPages}
        footerLabel={footerLabel}
      />
    </Page>
  );
}

interface CustomPageProps extends CommonPageProps {
  schedule: CustomScheduleInstance;
}

function CustomPage({
  schedule,
  pageNumber,
  totalPages,
  footerLabel,
  romanForTitle,
  styles,
  template,
  number,
}: CustomPageProps) {
  const doc = parseRichTextBody(schedule.body ?? "");
  return (
    <Page size="LETTER" style={styles.page} wrap>
      <PageHeader
        styles={styles}
        template={template}
        number={number}
        pageNumber={pageNumber}
        totalPages={totalPages}
      />
      <RuleWithOrnament styles={styles} />

      <Text style={styles.scheduleSubtitle}>
        Schedule {romanForTitle} · {(schedule.subtitle || "").toUpperCase()}
      </Text>
      <Text style={styles.scheduleTitle}>{schedule.title}</Text>

      <RuleWithOrnament styles={styles} ornament={"✦"} sparkle />

      {(doc.content ?? []).map((node, i) =>
        renderRichTextBlock(node, styles, i),
      )}

      <SharedFooter
        styles={styles}
        template={template}
        number={number}
        pageNumber={pageNumber}
        totalPages={totalPages}
        footerLabel={footerLabel}
      />
    </Page>
  );
}

// ----------------------------------------------------------------------------
// Orchestrator
// ----------------------------------------------------------------------------

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
  schedules: QuoteScheduleInstance[];
  showUnitPrice: boolean;
}

export function QuoteDocument(props: DocProps) {
  const {
    theme,
    template,
    schedules,
    number,
    name,
    createdAt,
    validUntil,
    paymentTerms,
    client,
    site,
    owner,
    sections,
    taxRatePct,
    discount,
    discountType,
    terms,
    showUnitPrice,
  } = props;

  const styles = createStyles(theme);
  const included = schedules.filter((s) => s.included);
  const totalPages = included.length;

  return (
    <Document
      title={`Quote ${number}`}
      author={template.tradeName}
      subject={name ?? "Quotation"}
    >
      {included.map((schedule, idx) => {
        const pageNumber = idx + 1;
        const footerLabel = getScheduleFooterLabel(included, idx);
        const romanForTitle = getScheduleRomanForIndex(included, idx);
        const common = {
          pageNumber,
          totalPages,
          footerLabel,
          romanForTitle,
          theme,
          template,
          styles,
          number,
          name,
        };
        switch (schedule.kind) {
          case "cover":
            return (
              <CoverPage
                key={schedule.id}
                {...common}
                schedule={schedule}
                createdAt={createdAt}
                validUntil={validUntil}
                paymentTerms={paymentTerms}
                client={client}
                site={site}
                owner={owner}
              />
            );
          case "particulars":
            return (
              <ParticularsPage
                key={schedule.id}
                {...common}
                schedule={schedule}
                sections={sections}
                taxRatePct={taxRatePct}
                discount={discount}
                discountType={discountType}
                showUnitPrice={showUnitPrice}
              />
            );
          case "agreement":
            return (
              <AgreementPage
                key={schedule.id}
                {...common}
                schedule={schedule}
                terms={terms}
              />
            );
          case "acceptance":
            return (
              <AcceptancePage
                key={schedule.id}
                {...common}
                schedule={schedule}
                client={client}
                owner={owner}
                validUntil={validUntil}
                sections={sections}
                taxRatePct={taxRatePct}
                discount={discount}
                discountType={discountType}
              />
            );
          case "custom":
            return (
              <CustomPage
                key={schedule.id}
                {...common}
                schedule={schedule}
              />
            );
          case "assurance":
            return (
              <AssurancePage
                key={schedule.id}
                {...common}
                schedule={schedule}
              />
            );
        }
      })}
    </Document>
  );
}
