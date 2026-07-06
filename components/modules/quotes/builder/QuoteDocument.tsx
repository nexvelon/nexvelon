"use client";

import React from "react";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { format, parseISO } from "date-fns";
import "@/lib/quote-fonts";
import { takeoffGroups } from "@/lib/quote-helpers";
import { computeQuoteTotals } from "@/lib/quotes/totals";
import { monitoringTotals, GUARDIAN_ONLY_KINDS } from "@/lib/quote-schedules";
import type { QuoteTheme } from "@/lib/quote-themes";
import type { QuoteTemplate } from "@/lib/company-profile";
import type {
  AcceptanceScheduleInstance,
  AgreementScheduleInstance,
  AssuranceScheduleInstance,
  DispatchScheduleInstance,
  KeyholdersScheduleInstance,
  PadScheduleInstance,
  CoverScheduleInstance,
  CustomScheduleInstance,
  DrawingsScheduleInstance,
  MonitoringScheduleInstance,
  ParticularsScheduleInstance,
  ScopeScheduleInstance,
  QuoteScheduleInstance,
} from "@/lib/quote-schedules";
import { parseRichTextBody, isRichTextEmpty } from "@/lib/quote-rich-text";
import type { JSONContent } from "@tiptap/core";
import type { Client, QuoteSection, Site, User } from "@/lib/types";

// ----------------------------------------------------------------------------
// Theme-derived colour helpers
// ----------------------------------------------------------------------------

function mutedFor(theme: QuoteTheme): string {
  return `${theme.ink}99`; // 60% alpha
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
      paddingHorizontal: 64,
      paddingVertical: 64,
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
    // QUOTE-FIX (Batch A) #4 — absolutely-centered ornament. Header and footer
    // both apply this so the ❦ centers on the page axis (W/2) independent of the
    // side text widths, putting the top and bottom ornaments on the SAME
    // vertical line (header box is symmetric in [64,W-64]; footer in [56,W-56] —
    // both centered on W/2).
    ornamentCenter: {
      position: "absolute",
      left: 0,
      right: 0,
      textAlign: "center",
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
    // QD-2 Phase 3 — section-title pattern (eyebrow + italic display)
    sectionEyebrow: {
      fontFamily: "Inter",
      fontSize: 10,
      fontWeight: 500,
      color: theme.accent,
      letterSpacing: 5, // 0.5em at 10pt
      textTransform: "uppercase",
      textAlign: "center",
      marginTop: 6,
      marginBottom: 8,
    },
    sectionDisplay: {
      fontFamily: "Cormorant Garamond",
      fontStyle: "italic",
      fontSize: 42,
      color: theme.accent,
      textAlign: "center",
      marginBottom: 16,
    },
    // QD-2 Phase 3 — lining figures for all numeric sites (non-italic,
    // weight 500, tight letter-spacing). Composed onto existing styles.
    numText: {
      fontFamily: "Inter",
      fontStyle: "normal",
      fontWeight: 500,
      letterSpacing: 0.15, // ≈0.015em at 10pt
    },

    // ----- QD-2 Phase 5a — Drawings & Take-off -----
    drawingsTitleBlock: {
      flexDirection: "row",
      borderTopWidth: 0.5,
      borderTopColor: theme.accent,
      borderBottomWidth: 0.5,
      borderBottomColor: theme.accent,
      paddingVertical: 8,
      marginVertical: 14,
    },
    drawingsTitleCell: {
      flex: 1,
      paddingHorizontal: 10,
      borderRightWidth: 0.5,
      borderRightColor: theme.accent,
    },
    drawingsTitleCellLast: {
      flex: 1,
      paddingHorizontal: 10,
    },
    drawingsTitleLabel: {
      fontFamily: "Inter",
      fontSize: 6.5,
      fontWeight: 500,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      color: theme.accent,
      marginBottom: 3,
    },
    drawingsTitleValue: {
      fontFamily: "Inter",
      fontSize: 9,
      color: theme.ink,
    },
    // Drawing area — bounded rectangle with dot grid background
    drawingsArea: {
      height: 400,
      borderWidth: 0.5,
      borderColor: theme.accent,
      position: "relative",
      marginBottom: 20,
      overflow: "hidden",
    },
    drawingsAreaPlaceholder: {
      position: "absolute",
      top: "50%",
      left: 0,
      right: 0,
      textAlign: "center",
      fontFamily: "Cormorant Garamond",
      fontStyle: "italic",
      fontSize: 11,
      color: theme.accentMuted ?? theme.accent,
    },
    drawingsDot: {
      position: "absolute",
      width: 1.2,
      height: 1.2,
      backgroundColor: theme.accent,
      opacity: 0.35,
    },
    // Take-off chips section
    takeoffHeading: {
      fontFamily: "Inter",
      fontSize: 9,
      fontWeight: 500,
      letterSpacing: 2,
      textTransform: "uppercase",
      color: theme.accent,
      marginTop: 8,
      marginBottom: 10,
    },
    takeoffGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    takeoffChip: {
      flexBasis: "31%",
      minHeight: 48,
      borderWidth: 0.5,
      borderColor: theme.accent,
      paddingHorizontal: 10,
      paddingVertical: 8,
      backgroundColor: "rgba(255,255,255,0.02)",
    },
    takeoffChipClass: {
      fontFamily: "Inter",
      fontSize: 7,
      fontWeight: 500,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      color: theme.accentMuted ?? theme.accent,
      marginBottom: 3,
    },
    takeoffChipQty: {
      fontFamily: "Cormorant Garamond",
      fontStyle: "italic",
      fontSize: 18,
      color: theme.ink,
    },
    takeoffChipLines: {
      fontFamily: "Inter",
      fontSize: 7,
      color: theme.accentMuted ?? theme.accent,
      marginTop: 2,
    },

    // ----- QD-2 Phase 5c — embedded drawing image pages -----
    drawingsImageContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 4,
    },
    drawingsImage: {
      maxWidth: 467, // A4 width minus 64px padding each side
      maxHeight: 580, // generous vertical space minus header/footer
      objectFit: "contain", // preserve aspect ratio
    },
    // First drawing shares the summary page below the title block, so it gets
    // less vertical room than a standalone image page.
    drawingsFirstImageContainer: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 8,
      marginTop: 8,
    },
    drawingsFirstImage: {
      maxWidth: 467,
      maxHeight: 420, // smaller than a full-page image — title block sits above
      objectFit: "contain",
    },

    // ----- Cover page -----
    coverPage: {
      fontFamily: "Inter",
      backgroundColor: theme.ambience,
      paddingHorizontal: 64,
      paddingVertical: 64,
      paddingBottom: 80,
      fontSize: 9,
      color: theme.ink,
    },
    coverBrandBlock: {
      alignItems: "center",
      marginVertical: 6,
    },
    coverBrandMark: {
      fontFamily: "Cormorant Garamond",
      fontWeight: "bold",
      fontSize: 64,
      color: theme.accent,
      letterSpacing: 14,
      textAlign: "center",
    },
    coverBrandMarkPrimary: {
      color: theme.brandPrimary ?? theme.accent,
    },
    coverBrandMarkSecondary: {
      color: theme.brandSecondary ?? theme.accent,
    },
    coverBrandSub: {
      fontFamily: "Inter",
      fontWeight: "medium",
      fontSize: 14,
      color: theme.brandSecondary ?? theme.accent,
      letterSpacing: 12,
      textTransform: "uppercase",
      textAlign: "center",
      marginTop: 8,
    },
    coverTagline: {
      fontFamily: "Cormorant Garamond",
      fontStyle: "italic",
      fontSize: 10,
      color: ink70(theme),
      textAlign: "center",
      marginTop: 10,
    },
    coverSubtitle: {
      fontFamily: "Inter",
      fontSize: 9,
      color: theme.accentMuted ?? theme.accent,
      letterSpacing: 3,
      textTransform: "uppercase",
      textAlign: "center",
      marginTop: 6,
    },
    coverTitle: {
      fontFamily: "Cormorant Garamond",
      fontStyle: "italic",
      fontSize: 60,
      color: theme.accent,
      textAlign: "center",
      marginTop: 6,
      marginBottom: 8,
    },
    coverDateLine: {
      fontFamily: "Cormorant Garamond",
      fontStyle: "italic",
      fontSize: 10,
      color: ink70(theme),
      textAlign: "center",
      marginBottom: 14,
    },
    coverTwoCol: {
      flexDirection: "row",
      marginVertical: 12,
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
    // Compact body rows for the Terms/Agreement page only — small but
    // legible (~7pt) so the full T&C spans fewer pages. Not used on the
    // Acceptance page, which keeps agreementLine.
    agreementBody: {
      fontFamily: "Cormorant Garamond",
      fontSize: 7,
      color: theme.ink,
      // PDF-FIX-1 #8 — tightened from 1.25 / 2 to pull the Integrated T&C from
      // 5 pages onto 4 without cutting any clause text.
      lineHeight: 1.2,
      marginBottom: 1.5,
    },
    // PDF-FIX-1 #16 — leading clause numbers (e.g. "1.", "1.1", "(1)") render
    // in a plain numeric font (Inter) instead of the decorative Cormorant
    // oldstyle figures. Numbers only; clause text styling is unchanged.
    agreementClauseNum: {
      fontFamily: "Inter",
      fontSize: 6.5,
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
    // QD-2 Phase 3 — SignatureBlock dual-line component
    signatureBlock: {
      marginTop: 24,
      marginBottom: 24,
    },
    signatureRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 48,
      marginBottom: 6,
    },
    signatureColumn: {
      flex: 1,
    },
    signatureLine: {
      borderBottomWidth: 1, // 1px ink — signature row
      borderBottomColor: theme.ink,
      height: 28,
      marginBottom: 4,
    },
    signatureLabel: {
      fontFamily: "Inter",
      fontSize: 7,
      fontWeight: 500,
      color: theme.accent,
      letterSpacing: 1,
      textTransform: "uppercase",
      marginBottom: 12,
    },
    signaturePrintedLine: {
      borderBottomWidth: 0.5, // 0.5px accent — printed name row
      borderBottomColor: theme.accent,
      height: 18,
      marginBottom: 4,
    },
    signaturePrintedLabel: {
      fontFamily: "Inter",
      fontSize: 6.5,
      color: theme.accent,
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    signatureDateLabel: {
      fontFamily: "Inter",
      fontSize: 6.5,
      color: theme.accentMuted ?? theme.accent,
      letterSpacing: 0.5,
      textTransform: "uppercase",
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
    // RT-FIX — Sub-body (heading level 3): smaller, muted; a quiet sub-note
    // beneath Body text.
    customSubBody: {
      fontFamily: "Cormorant Garamond",
      fontSize: 9,
      color: mutedFor(theme),
      lineHeight: 1.4,
      marginTop: 3,
      marginBottom: 1,
    },
    // RT-FIX — Big Heading (heading level 1): largest, bold, accent.
    customHeading1: {
      fontFamily: "Cormorant Garamond",
      fontSize: 20,
      fontWeight: "bold",
      color: theme.accent,
      lineHeight: 1.3,
      marginTop: 10,
      marginBottom: 4,
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

// QD-2 Phase 3 — shared section-title pattern (rule + ❦ + eyebrow +
// italic display). `title` is optional so pages without a big display
// title (e.g. AcceptancePage's "For Acceptance" eyebrow only) can pass
// just the eyebrow string.
function SectionTitle({
  eyebrow,
  title,
  styles,
}: {
  eyebrow: string;
  title?: string;
  styles: Styles;
}) {
  return (
    <View style={{ alignItems: "center", marginBottom: 16 }}>
      <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
      {title ? <Text style={styles.sectionDisplay}>{title}</Text> : null}
    </View>
  );
}

// QD-2 Phase 3 — dual-line signature block (1px ink for signature row,
// 0.5px accent for printed name & title).
function SignatureBlock({
  leftLabel,
  rightLabel,
  clientOnly = false,
  styles,
}: {
  leftLabel: string;
  rightLabel?: string;
  /** When true, render only the left (client) column — no counter-signature. */
  clientOnly?: boolean;
  styles: Styles;
}) {
  return (
    <View style={styles.signatureBlock}>
      <View style={styles.signatureRow}>
        <View style={styles.signatureColumn}>
          <View style={styles.signatureLine} />
          <Text style={styles.signatureLabel}>{leftLabel}</Text>
          <View style={styles.signaturePrintedLine} />
          <Text style={styles.signaturePrintedLabel}>
            Printed name &amp; title
          </Text>
        </View>
        {!clientOnly && (
          <View style={styles.signatureColumn}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>{rightLabel}</Text>
            <View style={styles.signaturePrintedLine} />
            <Text style={styles.signaturePrintedLabel}>
              Printed name &amp; title
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.signatureDateLabel}>
        Date: ____________________________
      </Text>
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
      <Text style={[styles.pageHeaderCenter, styles.ornamentCenter]}>{"❦"}</Text>
      <Text style={[styles.pageHeaderText, styles.numText]}>
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
        <Text style={[styles.footerLegalLine, styles.numText]} fixed>
          {legalLine}
        </Text>
      ) : null}
      <View style={styles.sharedFooter} fixed>
        <Text style={styles.footerLeft}>{template.footerShort}</Text>
        {/* QUOTE-FIX (Batch A) #4 — same absolutely-centered ornament as the
            header, so top & bottom ❦ share the page's vertical centre axis. */}
        <Text style={[styles.footerCenter, styles.ornamentCenter]}>{"❦"}</Text>
        <Text style={[styles.footerRight, styles.numText]}>{right}</Text>
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
  preparedBy?: string;
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
  preparedBy,
}: CoverPageProps) {
  const scope = schedule.scopeOfWorks?.trim() ?? "";
  const dropCap = scope.length > 0 ? scope.charAt(0) : "";
  const dropBody = scope.length > 0 ? scope.slice(1) : "";

  return (
    <Page size="A4" style={styles.coverPage} wrap>      <LogoSlot variant="cover" styles={styles} />
      <RuleWithOrnament styles={styles} />

      <View style={styles.coverBrandBlock}>
        <Text style={styles.coverBrandMark}>
          <Text style={styles.coverBrandMarkPrimary}>
            {template.brandMark.substring(0, 3)}
          </Text>
          <Text style={styles.coverBrandMarkSecondary}>
            {template.brandMark.substring(3)}
          </Text>
        </Text>
        <Text style={styles.coverBrandSub}>{template.brandSub}</Text>
        <Text style={styles.coverTagline}>{template.tagline}</Text>
      </View>

      <RuleWithOrnament styles={styles} />

      <Text style={styles.coverSubtitle}>{schedule.subtitle}</Text>
      <Text style={styles.coverTitle}>{schedule.title}</Text>
      <Text style={[styles.coverDateLine, styles.numText]}>
        Quote# {number}, dated {safeFormat(createdAt, "MMMM d, yyyy")}
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
          <Text style={[styles.coverMetaValue, styles.numText]}>
            {safeFormat(createdAt, "MMMM d, yyyy")}
          </Text>
        </View>
        <View style={styles.coverMetaCol}>
          <Text style={styles.coverMetaLabel}>Valid Until</Text>
          <Text style={[styles.coverMetaValue, styles.numText]}>
            {safeFormat(validUntil, "MMMM d, yyyy")}
          </Text>
        </View>
        <View style={styles.coverMetaCol}>
          <Text style={styles.coverMetaLabel}>Terms</Text>
          <Text style={[styles.coverMetaValue, styles.numText]}>{paymentTerms}</Text>
        </View>
        <View style={styles.coverMetaCol}>
          <Text style={styles.coverMetaLabel}>Prepared By</Text>
          <Text style={[styles.coverMetaValue, styles.numText]}>{preparedBy ?? owner?.name ?? "—"}</Text>
        </View>
      </View>

      <RuleWithOrnament styles={styles} ornament={"◆"} />

      {scope.length > 0 ? (
        <View>
          {/* QUOTE-FIX (Batch A) #2 — this cover field is now generic optional
              text (Scope of Work moved to its own schedule), so the stale
              "The Scope of Works" heading is dropped; the drop-cap prose stays. */}
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
  showVendor: boolean;
  showSku: boolean;
  showUpc: boolean;
  showMasterPart: boolean;
  showName: boolean;
  showDescription: boolean;
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
  showVendor,
  showSku,
  showUpc,
  showMasterPart,
  showName,
  showDescription,
}: ParticularsPageProps) {
  const totals = computeQuoteTotals(sections, taxRatePct / 100, discount, discountType);
  const subtitleSuffix = schedule.subtitle || "Bill of Materials";
  const renderableSections = sections.filter((s) => s.items.length > 0);

  return (
    <Page size="A4" style={styles.page} wrap>      <PageHeader
        styles={styles}
        template={template}
        number={number}
        pageNumber={pageNumber}
        totalPages={totalPages}
      />
      <SectionTitle
        eyebrow={`Schedule ${romanForTitle} · ${subtitleSuffix}`}
        title={schedule.title}
        styles={styles}
      />

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
              // QUOTE-LABOUR: a managed labour line renders from its per-line
              // show flags. The line total ALWAYS shows; description / hours /
              // rate each appear only when their flag is on (hidden → "—"), and
              // the internal description is never shown unless show.description
              // is on (otherwise a generic "Labour" label). The unit-price
              // column only exists when the quote-level showUnitPrice is on, so
              // a rate with no column simply doesn't appear. Legacy "labor"
              // lines (no metadata) fall through to the part renderer below,
              // unchanged.
              if (it.labour) {
                const lref = `${prefix}.${String(itemIdx + 1).padStart(2, "0")}`;
                const lamount = it.qty * it.unitPrice;
                const lshow = it.labour.show ?? {};
                const label = lshow.description
                  ? it.description?.trim() || "Labour"
                  : "Labour";
                const hoursText = lshow.hours ? it.qty.toString() : "—";
                const rateText = lshow.rate ? usd(it.unitPrice) : "—";
                return (
                  <View style={styles.partRow} key={it.id}>
                    <View style={styles.partCellRef}>
                      <Text style={styles.partRefText}>{lref}</Text>
                    </View>
                    <View style={styles.partCellDesc}>
                      <Text style={styles.partDescText}>{label}</Text>
                    </View>
                    <Text style={[styles.partNumText, styles.partCellQty, styles.numText]}>
                      {hoursText}
                    </Text>
                    {showUnitPrice ? (
                      <Text style={[styles.partNumText, styles.partCellUnitPrice, styles.numText]}>
                        {rateText}
                      </Text>
                    ) : null}
                    <Text
                      style={[
                        styles.partNumText,
                        showUnitPrice
                          ? styles.partCellAmountWithUnit
                          : styles.partCellAmount,
                        styles.numText,
                      ]}
                    >
                      {usd(lamount)}
                    </Text>
                  </View>
                );
              }
              // Parts and labour render identically (QB-3).
              const amount = it.qty * it.unitPrice;
              const unit = it.unitPrice;
              const qty = it.qty.toString();
              const ref = `${prefix}.${String(itemIdx + 1).padStart(2, "0")}`;
              const primary =
                showName && it.name
                  ? it.name
                  : showDescription && it.description
                    ? it.description
                    : "—";
              const showSecondaryDesc =
                showName && it.name && showDescription && it.description;
              // CAT-2: the displayed part number is the Master Part # when that
              // toggle is on and the line has one (our own number on the quote);
              // otherwise it falls back to SKU per showSku.
              const masterPart =
                showMasterPart && it.masterPartNumber
                  ? it.masterPartNumber
                  : null;
              const partNumber =
                masterPart ?? (showSku && it.sku ? it.sku : null);
              const upcPart = showUpc && it.upc ? it.upc : null;
              const vendorPart = showVendor && it.vendor ? it.vendor : null;
              // INV-2: a committed serialized unit carries its serial snapshot —
              // always surface it (it's a per-unit fact, not toggle-gated).
              const serialPart = it.serialNumber?.trim()
                ? `SN ${it.serialNumber.trim()}`
                : null;
              const tertiarySegments = [
                partNumber ? `Part # ${partNumber}` : null,
                upcPart ? `UPC ${upcPart}` : null,
                vendorPart,
                serialPart,
              ].filter((s): s is string => !!s);
              return (
                <View style={styles.partRow} key={it.id}>
                  <View style={styles.partCellRef}>
                    <Text style={styles.partRefText}>{ref}</Text>
                  </View>
                  <View style={styles.partCellDesc}>
                    <Text style={styles.partDescText}>{primary}</Text>
                    {showSecondaryDesc ? (
                      <Text style={styles.partDescSku}>{it.description}</Text>
                    ) : null}
                    {tertiarySegments.length > 0 ? (
                      <Text style={styles.partDescSku}>
                        {tertiarySegments.join(" · ")}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.partNumText, styles.partCellQty, styles.numText]}>{qty}</Text>
                  {showUnitPrice ? (
                    <Text style={[styles.partNumText, styles.partCellUnitPrice, styles.numText]}>
                      {usd(unit)}
                    </Text>
                  ) : null}
                  <Text
                    style={[
                      styles.partNumText,
                      showUnitPrice
                        ? styles.partCellAmountWithUnit
                        : styles.partCellAmount,
                      styles.numText,
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
          <Text style={[styles.partTotalsValue, styles.numText]}>{usd(totals.sellingPriceSubtotal)}</Text>
        </View>
        {totals.discountAmount > 0 ? (
          <View style={styles.partTotalsRow}>
            {/* QB-FIX-2: show the discount unit — "Discount (10%)" for a
                percent, "Discount ($500.00)" for a flat amount. */}
            <Text style={styles.partTotalsLabel}>
              {discountType === "amount"
                ? `Discount (${usd(discount)})`
                : `Discount (${discount}%)`}
            </Text>
            <Text style={[styles.partTotalsValue, styles.numText]}>
              −{usd(totals.discountAmount)}
            </Text>
          </View>
        ) : null}
        {totals.discountAmount > 0 ? (
          <View style={styles.partTotalsRow}>
            <Text style={styles.partTotalsLabel}>Adjusted Subtotal</Text>
            <Text style={[styles.partTotalsValue, styles.numText]}>
              {usd(totals.sellingPriceAfterDiscount)}
            </Text>
          </View>
        ) : null}
        <View style={styles.partTotalsRow}>
          <Text style={styles.partTotalsLabel}>
            HST ({taxRatePct.toFixed(2)}%)
          </Text>
          <Text style={[styles.partTotalsValue, styles.numText]}>{usd(totals.taxAmount)}</Text>
        </View>
        <View style={styles.partGrandRow}>
          <Text style={styles.partGrandLabel}>Total, in Canadian Dollars</Text>
          <Text style={[styles.partGrandValue, styles.numText]}>{usd(totals.sellingPriceTotal)}</Text>
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

// GF-1 — Guardian Monitoring Services page. Self-contained recurring fees:
// per-service monthly fees → monthly + annual (×12, billed in advance) totals,
// plus an optional one-time setup line. Independent of quoteTotals.
interface MonitoringPageProps extends CommonPageProps {
  schedule: MonitoringScheduleInstance;
}

function MonitoringPage({
  schedule,
  pageNumber,
  totalPages,
  footerLabel,
  romanForTitle,
  styles,
  template,
  number,
}: MonitoringPageProps) {
  const subtitleSuffix = schedule.subtitle || "Recurring monitoring fees";
  const { monthly, annual, setup } = monitoringTotals(schedule);
  const services = schedule.services.filter(
    (s) => (s.label && s.label.trim().length > 0) || s.monthlyFee
  );

  return (
    <Page size="A4" style={styles.page} wrap>      <PageHeader
        styles={styles}
        template={template}
        number={number}
        pageNumber={pageNumber}
        totalPages={totalPages}
      />
      <SectionTitle
        eyebrow={`Schedule ${romanForTitle} · ${subtitleSuffix}`}
        title={schedule.title}
        styles={styles}
      />

      <View style={styles.partTableHead}>
        <Text style={[styles.partTableHeadText, styles.partCellDesc]}>
          Service
        </Text>
        <Text style={[styles.partTableHeadText, styles.partCellAmount]}>
          Monthly Fee
        </Text>
      </View>
      {services.map((svc) => (
        <View style={styles.partRow} key={svc.id}>
          <View style={styles.partCellDesc}>
            <Text style={styles.partDescText}>{svc.label || "—"}</Text>
            {svc.detail ? (
              <Text style={styles.partDescSku}>{svc.detail}</Text>
            ) : null}
          </View>
          <Text
            style={[styles.partNumText, styles.partCellAmount, styles.numText]}
          >
            {usd(svc.monthlyFee || 0)}
          </Text>
        </View>
      ))}

      <View style={styles.partRule} />

      <View style={styles.partTotalsBlock}>
        <View style={styles.partTotalsRow}>
          <Text style={styles.partTotalsLabel}>Monthly total</Text>
          <Text style={[styles.partTotalsValue, styles.numText]}>
            {usd(monthly)}
          </Text>
        </View>
        {setup > 0 ? (
          <View style={styles.partTotalsRow}>
            <Text style={styles.partTotalsLabel}>
              {schedule.setupLabel?.trim() || "One-time setup"}
            </Text>
            <Text style={[styles.partTotalsValue, styles.numText]}>
              {usd(setup)}
            </Text>
          </View>
        ) : null}
        <View style={styles.partGrandRow}>
          <Text style={styles.partGrandLabel}>
            Annual total (billed in advance)
          </Text>
          <Text style={[styles.partGrandValue, styles.numText]}>
            {usd(annual)}
          </Text>
        </View>
      </View>

      {schedule.billingNote && schedule.billingNote.trim().length > 0 ? (
        <Text style={styles.agreementBody}>{schedule.billingNote}</Text>
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
  return (
    <Page size="A4" style={styles.page} wrap>      <PageHeader
        styles={styles}
        template={template}
        number={number}
        pageNumber={pageNumber}
        totalPages={totalPages}
      />
      <SectionTitle
        eyebrow={`Schedule ${romanForTitle} · ${subtitleSuffix}`}
        title={schedule.title}
        styles={styles}
      />

      {lines.map((line, i) => {
        // PDF-FIX-1 #16 — split a leading clause number ("1.", "1.1", "(1)",
        // "(a)") onto a plain Inter run; the rest of the line keeps the body
        // (Cormorant) styling. Same characters — visual only, no text change.
        const m = line.match(/^(\d+(?:\.\d+)*\.?|\(\d+\)|\([a-z]\))(\s+)(.*)$/);
        if (m) {
          return (
            <Text style={styles.agreementBody} key={i}>
              <Text style={styles.agreementClauseNum}>{m[1]}</Text>
              {m[2]}
              {m[3]}
            </Text>
          );
        }
        return (
          <Text style={styles.agreementBody} key={i}>
            {line || " "}
          </Text>
        );
      })}

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
  validUntil,
  sections,
  taxRatePct,
  discount,
  discountType,
}: AcceptancePagePropsExt) {
  const totals = computeQuoteTotals(sections, taxRatePct / 100, discount, discountType);
  return (
    <Page size="A4" style={styles.page} wrap>      <PageHeader
        styles={styles}
        template={template}
        number={number}
        pageNumber={pageNumber}
        totalPages={totalPages}
      />
      <SectionTitle eyebrow="For Acceptance" styles={styles} />

      <View style={styles.acceptBox}>
        <View style={styles.acceptBoxLeft}>
          <Text style={[styles.acceptQuoteLine, styles.numText]}>Quotation {number}</Text>
          <Text style={[styles.acceptValidLine, styles.numText]}>
            valid until {safeFormat(validUntil, "MMMM d, yyyy")}
          </Text>
        </View>
        <View style={styles.acceptBoxRight}>
          <Text style={styles.acceptTotalLabel}>Total · CAD</Text>
          <Text style={[styles.acceptTotalValue, styles.numText]}>{usd(totals.sellingPriceTotal)}</Text>
        </View>
      </View>

      <Text style={styles.acceptHeading}>Acceptance of Proposal</Text>

      <Text style={styles.agreementLine}>
        The undersigned acknowledges having read this Quote/Proposal and{" "}
        {template.legalName}&apos;s Terms and Conditions, which are hereby agreed
        to and accepted this __ day of ________________, 20__. The
        undersigned further confirms that they are signing voluntarily and of
        their own free will, with full understanding of its contents, are of
        sound mind and full legal capacity, and are not acting under any duress,
        coercion, undue influence, or the influence of any substance that would
        impair their judgment.
      </Text>

      <Text style={styles.agreementLine}>
        I have authority to bind the corporation.
      </Text>

      <SignatureBlock
        leftLabel="Client signature"
        clientOnly
        styles={styles}
      />

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
    // RT-FIX: render soft line breaks (Shift+Enter) instead of dropping them —
    // a newline inside a react-pdf <Text> wraps to the next line.
    if (n.type === "hardBreak") {
      return <Text key={i}>{"\n"}</Text>;
    }
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
      // RT-FIX: level 1 = Big Heading, level 2 = Title, level 3 = Sub-body.
      const level = (node.attrs?.level as number) ?? 2;
      const style =
        level === 1
          ? styles.customHeading1
          : level === 2
            ? styles.customHeading2
            : styles.customSubBody;
      return (
        <Text key={key} style={style}>
          {renderRichTextInline(node.content)}
        </Text>
      );
    }
    case "bulletList":
    case "orderedList": {
      const ordered = node.type === "orderedList";
      // RT-BULLETS — bullet lists carry a chosen `symbol` glyph (default "•");
      // ordered lists are unaffected.
      const bulletSymbol = (node.attrs?.symbol as string) || "•";
      return (
        <View key={key} style={styles.customList}>
          {(node.content ?? []).map((item, i) => (
            <View key={i} style={styles.customListItem}>
              <Text style={styles.customListBullet}>
                {ordered ? `${i + 1}.` : bulletSymbol}
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
    <Page size="A4" style={styles.page} wrap>      <PageHeader
        styles={styles}
        template={template}
        number={number}
        pageNumber={pageNumber}
        totalPages={totalPages}
      />
      <SectionTitle
        eyebrow={`Schedule ${romanForTitle} · ${subtitleSuffix.toUpperCase()}`}
        title={schedule.title}
        styles={styles}
      />

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

// SCOPE-1 / QUOTE-FIX (Batch A) — structured Scope of Work page. Renders the
// section title, then each sub-section's SUBTITLE and BODY as rich text via the
// same renderRichTextBlock path custom sections use (headings, lists, bullet
// symbols, bold/italic). Legacy plain-string subtitle/body are parsed forward
// by parseRichTextBody. Empty sub-sections (both docs empty) are skipped.
interface ScopePageProps extends CommonPageProps {
  schedule: ScopeScheduleInstance;
}

function ScopePage({
  schedule,
  pageNumber,
  totalPages,
  footerLabel,
  romanForTitle,
  styles,
  template,
  number,
}: ScopePageProps) {
  const subtitleSuffix = schedule.subtitle || "Scope of Work";
  // Parse each sub-section's subtitle/body forward; skip a sub-section only when
  // BOTH its docs are empty (legacy plain strings parse to non-empty docs).
  const visibleSections = schedule.sections
    .map((s) => ({
      id: s.id,
      subtitleDoc: parseRichTextBody(s.subtitle),
      bodyDoc: parseRichTextBody(s.body),
    }))
    .filter(
      (s) => !isRichTextEmpty(s.subtitleDoc) || !isRichTextEmpty(s.bodyDoc)
    );
  return (
    <Page size="A4" style={styles.page} wrap>      <PageHeader
        styles={styles}
        template={template}
        number={number}
        pageNumber={pageNumber}
        totalPages={totalPages}
      />
      <SectionTitle
        eyebrow={`Schedule ${romanForTitle} · ${subtitleSuffix.toUpperCase()}`}
        title={schedule.title}
        styles={styles}
      />

      {visibleSections.map((section) => {
        const subLen = section.subtitleDoc.content?.length ?? 0;
        return (
          <View key={section.id} wrap={false}>
            {(section.subtitleDoc.content ?? []).map((node, i) =>
              renderRichTextBlock(node, styles, i)
            )}
            {(section.bodyDoc.content ?? []).map((node, i) =>
              renderRichTextBlock(node, styles, subLen + i)
            )}
          </View>
        );
      })}

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

// GF-2 — Guardian Dispatch & False-Alarm Election page. Renders the regional-
// fee acknowledgment, the dispatch election (marked options), per-authority
// authorization with initial lines, and a closing responsibility note. No
// pricing.
interface DispatchPageProps extends CommonPageProps {
  schedule: DispatchScheduleInstance;
}

function DispatchPage({
  schedule,
  pageNumber,
  totalPages,
  footerLabel,
  romanForTitle,
  styles,
  template,
  number,
}: DispatchPageProps) {
  const subtitleSuffix =
    schedule.subtitle || "Authority dispatch and regional false-alarm fees";
  const mark = (on: boolean) => (on ? "[X]" : "[ ]");
  const authorities: { label: string; on: boolean }[] = [
    { label: "Police", on: schedule.authorizePolice },
    { label: "Fire", on: schedule.authorizeFire },
    { label: "Ambulance", on: schedule.authorizeAmbulance },
  ];

  return (
    <Page size="A4" style={styles.page} wrap>      <PageHeader
        styles={styles}
        template={template}
        number={number}
        pageNumber={pageNumber}
        totalPages={totalPages}
      />
      <SectionTitle
        eyebrow={`Schedule ${romanForTitle} · ${subtitleSuffix}`}
        title={schedule.title}
        styles={styles}
      />

      {schedule.regionalFeeNote && schedule.regionalFeeNote.trim().length > 0 ? (
        <Text style={styles.agreementLine}>{schedule.regionalFeeNote}</Text>
      ) : null}

      <Text style={styles.partSectionHeader}>Dispatch Election</Text>
      <Text style={styles.agreementLine}>
        {mark(schedule.election === "accept_regional")} I accept the applicable
        regional police-dispatch fees and authorize Nexvelon to request dispatch
        accordingly.
      </Text>
      <Text style={styles.agreementLine}>
        {mark(schedule.election === "decline_police")} I decline police dispatch
        and rely on keyholder and/or private security guard response.
      </Text>

      {schedule.election === "decline_police" &&
      schedule.privateResponseNote &&
      schedule.privateResponseNote.trim().length > 0 ? (
        <Text style={styles.agreementLine}>{schedule.privateResponseNote}</Text>
      ) : null}

      <Text style={styles.partSectionHeader}>Authorized Services</Text>
      {authorities.map((a) => (
        <Text style={styles.agreementLine} key={a.label}>
          {mark(a.on)} {a.label}    Client initial: ______
        </Text>
      ))}

      <Text style={styles.agreementLine}>
        Nexvelon is not responsible for the response, non-response, conduct, or
        timing of any authority or private guard, or for any false-alarm fees,
        all of which are the Client&apos;s responsibility.
      </Text>

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

// GF-3 — Guardian Keyholders & Response Protocol page. Renders the keyholder /
// pass-card table (blank ruled rows when the list is empty, like a printed
// form), the per-event response sequences, and the note. Keyholder contacts
// only — no pricing or card data.
interface KeyholdersPageProps extends CommonPageProps {
  schedule: KeyholdersScheduleInstance;
}

const KH_COLS = {
  name: "22%",
  priority: "11%",
  home: "16%",
  mobile: "16%",
  business: "16%",
  passcard: "11%",
  auth: "8%",
} as const;

function KeyholdersPage({
  schedule,
  pageNumber,
  totalPages,
  footerLabel,
  romanForTitle,
  styles,
  template,
  number,
}: KeyholdersPageProps) {
  const subtitleSuffix =
    schedule.subtitle || "Authorized keyholders and response sequence";
  const rows =
    schedule.keyholders.length > 0
      ? schedule.keyholders
      : // Empty → blank ruled rows so the client can hand-write, like a
        // printed keyholder form.
        (Array.from({ length: 4 }, (_, i) => ({
          id: `blank-${i}`,
          name: "",
          priority: "",
          homePhone: "",
          mobilePhone: "",
          businessPhone: "",
          passcard: "",
          authorizedToChange: false,
        })) as KeyholdersScheduleInstance["keyholders"]);

  const protocol: { label: string; seq?: string }[] = [
    { label: "Burglar", seq: schedule.burglar },
    { label: "Fire", seq: schedule.fire },
    { label: "Duress", seq: schedule.duress },
    { label: "Medical", seq: schedule.medical },
  ];

  return (
    <Page size="A4" style={styles.page} wrap>      <PageHeader
        styles={styles}
        template={template}
        number={number}
        pageNumber={pageNumber}
        totalPages={totalPages}
      />
      <SectionTitle
        eyebrow={`Schedule ${romanForTitle} · ${subtitleSuffix}`}
        title={schedule.title}
        styles={styles}
      />

      <View style={styles.partTableHead}>
        <Text style={[styles.partTableHeadText, { width: KH_COLS.name }]}>
          Name
        </Text>
        <Text style={[styles.partTableHeadText, { width: KH_COLS.priority }]}>
          Priority
        </Text>
        <Text style={[styles.partTableHeadText, { width: KH_COLS.home }]}>
          Home
        </Text>
        <Text style={[styles.partTableHeadText, { width: KH_COLS.mobile }]}>
          Mobile
        </Text>
        <Text style={[styles.partTableHeadText, { width: KH_COLS.business }]}>
          Business
        </Text>
        <Text style={[styles.partTableHeadText, { width: KH_COLS.passcard }]}>
          Passcard
        </Text>
        <Text style={[styles.partTableHeadText, { width: KH_COLS.auth }]}>
          Auth
        </Text>
      </View>
      {rows.map((k) => (
        <View style={[styles.partRow, { minHeight: 18 }]} key={k.id}>
          <Text style={[styles.partNumText, { width: KH_COLS.name }]}>
            {k.name || " "}
          </Text>
          <Text style={[styles.partNumText, { width: KH_COLS.priority }]}>
            {k.priority || " "}
          </Text>
          <Text style={[styles.partNumText, { width: KH_COLS.home }]}>
            {k.homePhone || " "}
          </Text>
          <Text style={[styles.partNumText, { width: KH_COLS.mobile }]}>
            {k.mobilePhone || " "}
          </Text>
          <Text style={[styles.partNumText, { width: KH_COLS.business }]}>
            {k.businessPhone || " "}
          </Text>
          <Text style={[styles.partNumText, { width: KH_COLS.passcard }]}>
            {k.passcard || " "}
          </Text>
          <Text style={[styles.partNumText, { width: KH_COLS.auth }]}>
            {k.authorizedToChange ? "✓" : " "}
          </Text>
        </View>
      ))}

      <Text style={styles.partSectionHeader}>Response Protocol</Text>
      {protocol.map((p) => (
        <Text style={styles.agreementLine} key={p.label}>
          {p.label}: {p.seq && p.seq.trim().length > 0 ? p.seq : "______"}
        </Text>
      ))}

      {schedule.note && schedule.note.trim().length > 0 ? (
        <Text style={styles.agreementLine}>{schedule.note}</Text>
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

// GF-4 — Guardian Pre-Authorized Payment (PAD) Authorization page. Renders the
// authorization prose, blank payment-method checkboxes for the client to mark
// on paper, the collection note, and a signature block. DELIBERATELY captures
// no account/card numbers.
interface PadPageProps extends CommonPageProps {
  schedule: PadScheduleInstance;
}

function PadPage({
  schedule,
  pageNumber,
  totalPages,
  footerLabel,
  romanForTitle,
  styles,
  template,
  number,
}: PadPageProps) {
  const subtitleSuffix = schedule.subtitle || "Annual pre-authorized billing";

  return (
    <Page size="A4" style={styles.page} wrap>      <PageHeader
        styles={styles}
        template={template}
        number={number}
        pageNumber={pageNumber}
        totalPages={totalPages}
      />
      <SectionTitle
        eyebrow={`Schedule ${romanForTitle} · ${subtitleSuffix}`}
        title={schedule.title}
        styles={styles}
      />

      {schedule.authorizationText &&
      schedule.authorizationText.trim().length > 0 ? (
        <Text style={styles.agreementLine}>{schedule.authorizationText}</Text>
      ) : null}

      <Text style={styles.partSectionHeader}>Payment Method</Text>
      <Text style={styles.agreementLine}>
        [  ] Pre-authorized debit (bank account)    [  ] Credit card
      </Text>

      {schedule.collectionNote && schedule.collectionNote.trim().length > 0 ? (
        <Text style={styles.agreementLine}>{schedule.collectionNote}</Text>
      ) : null}

      <Text style={styles.partSectionHeader}>Authorization</Text>
      <Text style={styles.agreementLine}>
        Authorized signature: ______________________   Date: ______________
      </Text>
      <Text style={styles.agreementLine}>
        Name / title: ______________________
      </Text>

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
    <Page size="A4" style={styles.page} wrap>      <PageHeader
        styles={styles}
        template={template}
        number={number}
        pageNumber={pageNumber}
        totalPages={totalPages}
      />
      <SectionTitle
        eyebrow={`Schedule ${romanForTitle} · ${(schedule.subtitle || "").toUpperCase()}`}
        title={schedule.title}
        styles={styles}
      />

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
// Drawings & Take-off page (QD-2 Phase 5a)
// ----------------------------------------------------------------------------

function DrawingsDotGrid({
  styles,
  width,
  height,
  pitch = 24,
}: {
  styles: Styles;
  width: number;
  height: number;
  pitch?: number;
}) {
  const dots: { x: number; y: number }[] = [];
  for (let y = pitch; y < height; y += pitch) {
    for (let x = pitch; x < width; x += pitch) {
      dots.push({ x, y });
    }
  }
  return (
    <>
      {dots.map((d, i) => (
        <View key={i} style={[styles.drawingsDot, { left: d.x, top: d.y }]} />
      ))}
    </>
  );
}

interface DrawingsSummaryPageProps extends CommonPageProps {
  schedule: DrawingsScheduleInstance;
  sections: QuoteSection[];
  name: string; // project name (from quote.name or client name)
  siteName?: string;
  createdAt: string; // pre-formatted display string
  firstImageSrc?: string; // when present, render this drawing instead of placeholder + chips
  totalImageCount?: number; // total uploaded image count; undefined when no upload
}

function DrawingsSummaryPage({
  schedule,
  pageNumber,
  totalPages,
  footerLabel,
  romanForTitle,
  styles,
  template,
  number,
  sections,
  name,
  siteName,
  createdAt,
  firstImageSrc,
}: DrawingsSummaryPageProps) {
  const hasImages = !!firstImageSrc;
  // Skip the take-off chips when actual drawings are attached.
  const groups = hasImages ? [] : takeoffGroups(sections);
  return (
    <Page size="A4" style={styles.page} wrap>
      <PageHeader
        styles={styles}
        template={template}
        number={number}
        pageNumber={pageNumber}
        totalPages={totalPages}
      />
      <SectionTitle
        eyebrow={`Schedule ${romanForTitle} · ${(schedule.subtitle || "").toUpperCase()}`}
        title={schedule.title}
        styles={styles}
      />

      {/* Title block */}
      <View style={styles.drawingsTitleBlock}>
        <View style={styles.drawingsTitleCell}>
          <Text style={styles.drawingsTitleLabel}>Project</Text>
          <Text style={styles.drawingsTitleValue}>{name || "—"}</Text>
        </View>
        <View style={styles.drawingsTitleCell}>
          <Text style={styles.drawingsTitleLabel}>Site</Text>
          <Text style={styles.drawingsTitleValue}>{siteName || "—"}</Text>
        </View>
        <View style={styles.drawingsTitleCell}>
          <Text style={styles.drawingsTitleLabel}>Quote #</Text>
          <Text style={[styles.drawingsTitleValue, styles.numText]}>{number}</Text>
        </View>
        <View style={styles.drawingsTitleCell}>
          <Text style={styles.drawingsTitleLabel}>Scale</Text>
          <Text style={styles.drawingsTitleValue}>{schedule.scale || "N.T.S."}</Text>
        </View>
        <View style={styles.drawingsTitleCellLast}>
          <Text style={styles.drawingsTitleLabel}>Date</Text>
          <Text style={[styles.drawingsTitleValue, styles.numText]}>{createdAt}</Text>
        </View>
      </View>

      {hasImages ? (
        /* Drawings attached — render the first drawing on this page */
        <View style={styles.drawingsFirstImageContainer}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf <Image> is a PDF primitive, not an HTML <img>; it has no alt prop */}
          <Image src={firstImageSrc!} style={styles.drawingsFirstImage} />
        </View>
      ) : (
        <>
          {/* No drawings uploaded — Phase 5a placeholder + take-off chips */}
          <View style={styles.drawingsArea}>
            <DrawingsDotGrid styles={styles} width={467} height={400} pitch={24} />
            <Text style={styles.drawingsAreaPlaceholder}>
              Drawings to be attached separately
            </Text>
          </View>

          {groups.length > 0 && (
            <>
              <Text style={styles.takeoffHeading}>
                Bill of Materials — Take-off Summary
              </Text>
              <View style={styles.takeoffGrid}>
                {groups.map((g, i) => (
                  <View key={i} style={styles.takeoffChip}>
                    <Text style={styles.takeoffChipClass}>
                      {g.classification}
                    </Text>
                    <Text style={[styles.takeoffChipQty, styles.numText]}>
                      {g.totalQty}
                    </Text>
                    <Text style={styles.takeoffChipLines}>
                      {g.lineCount}{" "}
                      {g.lineCount === 1 ? "line item" : "line items"}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </>
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

interface DrawingsImagePageProps extends CommonPageProps {
  imageSrc: string; // PNG data URL
  imageIndex: number; // 0-based
  totalImages: number; // total uploaded pages
}

function DrawingsImagePage({
  imageSrc,
  pageNumber,
  totalPages,
  styles,
  template,
  number,
}: DrawingsImagePageProps) {
  return (
    <Page size="A4" style={styles.page} wrap>
      <PageHeader
        styles={styles}
        template={template}
        number={number}
        pageNumber={pageNumber}
        totalPages={totalPages}
      />

      <View style={styles.drawingsImageContainer}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf <Image> is a PDF primitive, not an HTML <img>; it has no alt prop */}
        <Image src={imageSrc} style={styles.drawingsImage} />
      </View>

      <SharedFooter
        styles={styles}
        template={template}
        number={number}
        pageNumber={pageNumber}
        totalPages={totalPages}
        footerLabel="Drawings"
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
  preparedBy?: string;
  sections: QuoteSection[];
  taxRatePct: number;
  discount: number;
  discountType: "pct" | "amount";
  terms: string;
  theme: QuoteTheme;
  template: QuoteTemplate;
  schedules: QuoteScheduleInstance[];
  showUnitPrice: boolean;
  showVendor?: boolean;
  showSku?: boolean;
  showUpc?: boolean;
  showMasterPart?: boolean;
  showName?: boolean;
  showDescription?: boolean;
  // QD-2 Phase 5c — rendered drawing-PDF pages, keyed by Storage path.
  // Ephemeral (never persisted); absent slots fall back to the placeholder.
  drawingsImagesByPath?: Record<string, string[]>;
}

// QD-2 Phase 5c — how many rendered pages a schedule contributes. Every kind
// is 1 page except a drawings schedule with an uploaded PDF: it emits one page
// per uploaded page (the first page also carries the title block).
function pageCountOf(
  schedule: QuoteScheduleInstance,
  drawingsImagesByPath: Record<string, string[]>
): number {
  if (schedule.kind === "drawings") {
    if (!schedule.pdfPath) return 1; // no upload → 1 placeholder summary page
    const images = drawingsImagesByPath[schedule.pdfPath];
    if (!images || images.length === 0) return 1; // loading → 1 placeholder page
    return images.length; // each image = 1 page; first page carries the title block
  }
  return 1;
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
    preparedBy,
    sections,
    taxRatePct,
    discount,
    discountType,
    terms,
    showUnitPrice,
    showVendor = false,
    showSku = false,
    showUpc = false,
    showMasterPart = false,
    showName = true,
    showDescription = true,
    drawingsImagesByPath = {},
  } = props;

  const styles = createStyles(theme);
  // GF-5: Guardian-only sections never render on a non-Guardian quote, even if
  // present in the data (e.g. after switching entity away from Guardian).
  const isGuardianDoc = template.slug === "guardian";
  const included = schedules.filter(
    (s) =>
      s.included && (isGuardianDoc || !GUARDIAN_ONLY_KINDS.includes(s.kind))
  );
  // QD-2 Phase 5c — a drawings schedule expands to 1 + N pages, so the total
  // is the sum of each schedule's page count rather than included.length.
  const totalPages = included.reduce(
    (sum, s) => sum + pageCountOf(s, drawingsImagesByPath),
    0
  );

  // Running page counter — advances by 1 for normal schedules and by
  // 1 + N for a drawings schedule.
  let pageCounter = 0;

  return (
    <Document
      title={`Quote ${number}`}
      author={template.tradeName}
      subject={name ?? "Quotation"}
    >
      {included.flatMap((schedule, idx) => {
        const footerLabel = getScheduleFooterLabel(included, idx);
        const romanForTitle = getScheduleRomanForIndex(included, idx);

        // Drawings — the summary page carries the first drawing; any further
        // uploaded pages get their own image-only pages.
        if (schedule.kind === "drawings") {
          const images = schedule.pdfPath
            ? drawingsImagesByPath[schedule.pdfPath]
            : undefined;
          const pages: React.ReactElement[] = [];

          // Summary page — title block + first drawing (or placeholder + chips).
          pageCounter += 1;
          pages.push(
            <DrawingsSummaryPage
              key={`${schedule.id}-summary`}
              pageNumber={pageCounter}
              totalPages={totalPages}
              footerLabel={footerLabel}
              romanForTitle={romanForTitle}
              theme={theme}
              template={template}
              styles={styles}
              number={number}
              schedule={schedule}
              sections={sections}
              name={name || client?.name || ""}
              siteName={site?.name}
              createdAt={safeFormat(createdAt, "MMMM d, yyyy")}
              firstImageSrc={images?.[0]}
              totalImageCount={images?.length}
            />
          );

          // Images 1..N-1 — image 0 already sits on the summary page above.
          if (images && images.length > 1) {
            for (let imageIdx = 1; imageIdx < images.length; imageIdx++) {
              pageCounter += 1;
              pages.push(
                <DrawingsImagePage
                  key={`${schedule.id}-img-${imageIdx}`}
                  pageNumber={pageCounter}
                  totalPages={totalPages}
                  footerLabel={footerLabel}
                  romanForTitle={romanForTitle}
                  theme={theme}
                  template={template}
                  styles={styles}
                  number={number}
                  imageSrc={images[imageIdx]}
                  imageIndex={imageIdx}
                  totalImages={images.length}
                />
              );
            }
          }
          return pages;
        }

        // All other kinds — exactly one page each.
        pageCounter += 1;
        const common = {
          pageNumber: pageCounter,
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
                preparedBy={preparedBy}
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
                showVendor={showVendor}
                showSku={showSku}
                showUpc={showUpc}
                showMasterPart={showMasterPart}
                showName={showName}
                showDescription={showDescription}
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
          case "scope":
            return (
              <ScopePage
                key={schedule.id}
                {...common}
                schedule={schedule}
              />
            );
          case "monitoring":
            return (
              <MonitoringPage
                key={schedule.id}
                {...common}
                schedule={schedule}
              />
            );
          case "dispatch":
            return (
              <DispatchPage
                key={schedule.id}
                {...common}
                schedule={schedule}
              />
            );
          case "keyholders":
            return (
              <KeyholdersPage
                key={schedule.id}
                {...common}
                schedule={schedule}
              />
            );
          case "pad":
            return (
              <PadPage
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
