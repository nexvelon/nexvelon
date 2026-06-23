import "server-only";

// Server-side generation of the Site Application Form PDF. Mirrors
// signed-tc-pdf.tsx: @react-pdf's built-in fonts only (Times-Roman/Times-Bold
// serif headings evoke the brand Garamond; Helvetica body) so server
// `renderToBuffer` never trips on filesystem font loading. Navy + antique-gold
// brand colors.

import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

const NAVY = "#1a2332";
const GOLD = "#b8902c";
const INK = "#2A2418";

const styles = StyleSheet.create({
  page: { paddingTop: 54, paddingBottom: 64, paddingHorizontal: 56, fontFamily: "Helvetica", fontSize: 9, color: INK },
  eyebrow: { fontFamily: "Helvetica-Bold", fontSize: 8, letterSpacing: 2, color: GOLD, textTransform: "uppercase" },
  title: { fontFamily: "Times-Bold", fontSize: 20, color: NAVY, marginTop: 8 },
  rule: { borderBottomWidth: 1, borderBottomColor: GOLD, marginTop: 12, marginBottom: 16 },
  section: { marginTop: 18 },
  sectionEyebrow: { fontFamily: "Helvetica-Bold", fontSize: 8, letterSpacing: 1, color: GOLD, textTransform: "uppercase", borderBottomWidth: 1, borderBottomColor: "#E5DFD0", paddingBottom: 4, marginBottom: 8 },
  subBlock: { marginTop: 10 },
  subTitle: { fontFamily: "Times-Bold", fontSize: 11, color: NAVY, marginBottom: 4 },
  row: { flexDirection: "row", marginTop: 3 },
  label: { fontFamily: "Helvetica-Bold", fontSize: 8.5, color: "#5C5240", width: 130 },
  value: { fontFamily: "Times-Roman", fontSize: 9.5, color: INK, flex: 1 },
  footer: { marginTop: 28, borderTopWidth: 1, borderTopColor: "#E5DFD0", paddingTop: 10, fontSize: 8, color: "#5C5240" },
});

export interface SiteFormPdfInput {
  sf: Record<string, unknown>; // the site_form_data jsonb map
  email: string;
  submittedAt: string;
  policyAckAt: string | null;
}

function s(v: unknown): string {
  return String(v ?? "").trim();
}

function row(label: string, value: string): React.ReactElement | null {
  if (!value) return null;
  return React.createElement(
    View,
    { style: styles.row },
    React.createElement(Text, { style: styles.label }, label),
    React.createElement(Text, { style: styles.value }, value)
  );
}

function composeAddress(parts: string[]): string {
  return parts.map((p) => s(p)).filter(Boolean).join(", ");
}

function section(eyebrow: string, children: Array<React.ReactElement | null>): React.ReactElement | null {
  const kept = children.filter(Boolean);
  if (kept.length === 0) return null;
  return React.createElement(
    View,
    { style: styles.section, wrap: false },
    React.createElement(Text, { style: styles.sectionEyebrow }, eyebrow),
    ...kept
  );
}

function contactBlock(sf: Record<string, unknown>, prefix: string, role: string): React.ReactElement | null {
  const first = s(sf[`${prefix}First`]);
  const last = s(sf[`${prefix}Last`]);
  const email = s(sf[`${prefix}Email`]);
  const personalPhone = s(sf[`${prefix}PersonalPhone`]);
  const phone = s(sf[`${prefix}Phone`]);
  const officePhone = s(sf[`${prefix}OfficePhone`]);
  const name = [first, last].filter(Boolean).join(" ");

  if (!name && !email && !personalPhone && !phone && !officePhone) return null;

  const rows = [
    row("Name", name),
    row("Email", email),
    row("Personal phone", personalPhone),
    row("Work phone", phone),
    row("Office phone", officePhone),
  ].filter(Boolean);

  return React.createElement(
    View,
    { style: styles.subBlock, wrap: false },
    React.createElement(Text, { style: styles.subTitle }, role),
    ...rows
  );
}

function SiteFormDoc(input: SiteFormPdfInput) {
  const { sf } = input;

  const siteAddress = composeAddress([
    s(sf.siteStreet),
    s(sf.siteUnit),
    s(sf.siteCity),
    s(sf.siteProvince),
    s(sf.sitePostal),
    s(sf.siteCountry),
  ]);

  const billingParts = [
    s(sf.billingStreet),
    s(sf.billingUnit),
    s(sf.billingCity),
    s(sf.billingProvince),
    s(sf.billingPostal),
    s(sf.billingCountry),
  ];
  const billingValue = billingParts.some(Boolean) ? composeAddress(billingParts) : "Same as site address";

  const mailingParts = [
    s(sf.mailingStreet),
    s(sf.mailingUnit),
    s(sf.mailingCity),
    s(sf.mailingProvince),
    s(sf.mailingPostal),
    s(sf.mailingCountry),
  ];
  const mailingValue = mailingParts.some(Boolean) ? composeAddress(mailingParts) : "Same as site address";

  const gcName = [s(sf.gcFirst), s(sf.gcLast)].filter(Boolean).join(" ");

  const contacts = [
    contactBlock(sf, "c0", "Primary"),
    contactBlock(sf, "c1", "AP"),
  ].filter(Boolean);

  const sections = [
    section("Site", [row("Site / project name", s(sf.siteName))]),
    section("Site address", [row("Site address", siteAddress)]),
    section("Billing address", [row("Billing address", billingValue)]),
    section("Mailing address", [row("Mailing address", mailingValue)]),
    section("Tax information", [
      row("HST/GST #", s(sf.hstNumber)),
      row("Tax exempt", s(sf.taxExempt)),
      row("Exempt certificate", s(sf.taxExemptCert)),
    ]),
    section("Payment information", [
      row("Terms", s(sf.paymentTerms)),
      row("Method", s(sf.paymentMethod)),
      row("Currency", s(sf.currency)),
    ]),
    section("GC / Site Supervisor", [
      row("Name", gcName),
      row("Email", s(sf.gcEmail)),
      row("Personal phone", s(sf.gcPersonalPhone)),
      row("Work phone", s(sf.gcPhone)),
      row("Office phone", s(sf.gcOfficePhone)),
    ]),
    contacts.length > 0
      ? React.createElement(
          View,
          { style: styles.section },
          React.createElement(Text, { style: styles.sectionEyebrow }, "Contacts"),
          ...contacts
        )
      : null,
    input.policyAckAt
      ? section("Payment Policies", [row("Status", `Acknowledged at ${input.policyAckAt}`)])
      : null,
  ].filter(Boolean);

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: styles.page, wrap: true },
      React.createElement(Text, { style: styles.eyebrow }, "Nexvelon Global · Site Application"),
      React.createElement(Text, { style: styles.title }, "Nexvelon Global — Site Application Form"),
      React.createElement(View, { style: styles.rule }),
      ...sections,
      React.createElement(
        Text,
        { style: styles.footer },
        `Submitted by ${input.email} · ${input.submittedAt}`
      )
    )
  );
}

export async function renderSiteFormPdf(input: SiteFormPdfInput): Promise<Buffer> {
  const buf = await renderToBuffer(SiteFormDoc(input));
  return buf as Buffer;
}
