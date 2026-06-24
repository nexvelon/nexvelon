import "server-only";

// Server-side generation of the Client Application Form PDF. Mirrors
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

export interface ClientFormPdfInput {
  cf: Record<string, unknown>; // the client_form_data jsonb map
  email: string; // submitter email (footer)
  submittedAt: string; // already-formatted Toronto timestamp (footer)
  tierRequested: string | null; // e.g. "Gold" or null
  policyAckAt: string | null; // already-formatted Toronto timestamp, or null
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

function contactBlock(cf: Record<string, unknown>, prefix: string, role: string): React.ReactElement | null {
  const first = s(cf[`${prefix}First`]);
  const last = s(cf[`${prefix}Last`]);
  const email = s(cf[`${prefix}Email`]);
  const personalPhone = s(cf[`${prefix}PersonalPhone`]);
  const phone = s(cf[`${prefix}Phone`]);
  const officePhone = s(cf[`${prefix}OfficePhone`]);
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

function ClientFormDoc(input: ClientFormPdfInput) {
  const { cf } = input;

  const company = composeAddress([
    s(cf.companyStreet),
    s(cf.companyUnit),
    s(cf.companyCity),
    s(cf.companyProvince),
    s(cf.companyPostal),
    s(cf.companyCountry),
  ]);
  const companyValue = company || "—";

  const billingParts = [
    s(cf.billingStreet),
    s(cf.billingUnit),
    s(cf.billingCity),
    s(cf.billingProvince),
    s(cf.billingPostal),
    s(cf.billingCountry),
  ];
  const billing = composeAddress(billingParts);
  const billingValue = billingParts.some(Boolean) ? billing : "Same as Company Address";

  const mailingParts = [
    s(cf.mailingStreet),
    s(cf.mailingUnit),
    s(cf.mailingCity),
    s(cf.mailingProvince),
    s(cf.mailingPostal),
    s(cf.mailingCountry),
  ];
  const mailing = composeAddress(mailingParts);
  // POLISH-55 — mailing has two mutually-exclusive "same as" sources.
  const mailingValue =
    String(cf.mailing_same_as_company ?? "").trim() === "true"
      ? "Same as Company Address"
      : !mailingParts.some(Boolean) ||
          String(cf.mailing_same_as_billing ?? "").trim() !== "false"
        ? "Same as Billing Address"
        : mailing;

  const contacts = [
    contactBlock(cf, "c0", "Primary"),
    contactBlock(cf, "c1", "AP"),
    contactBlock(cf, "gc", "GC / Site Supervisor"),
  ].filter(Boolean);

  const sections = [
    section("Legal company info", [
      row("Legal name", s(cf.legalName)),
      row("Trade name", s(cf.tradeName)),
    ]),
    section("Company address", [row("Company address", companyValue)]),
    section("Billing address", [row("Billing address", billingValue)]),
    section("Mailing address", [row("Mailing address", mailingValue)]),
    section("Tax information", [
      row("HST/GST #", s(cf.hstNumber)),
      row("Tax exempt", s(cf.taxExempt)),
      row("Exempt certificate", s(cf.taxExemptCert)),
    ]),
    section("Payment information", [
      row("Terms", s(cf.paymentTerms)),
      row("Method", s(cf.paymentMethod)),
      row("Currency", s(cf.currency)),
    ]),
    contacts.length > 0
      ? React.createElement(
          View,
          { style: styles.section },
          React.createElement(Text, { style: styles.sectionEyebrow }, "Contacts"),
          ...contacts
        )
      : null,
    section("Prestige Tier", [row("Selected tier", input.tierRequested || "None")]),
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
      React.createElement(Text, { style: styles.eyebrow }, "Nexvelon Global · Client Application"),
      React.createElement(Text, { style: styles.title }, "Nexvelon Global — Client Application Form"),
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

export async function renderClientFormPdf(input: ClientFormPdfInput): Promise<Buffer> {
  const buf = await renderToBuffer(ClientFormDoc(input));
  return buf as Buffer;
}
