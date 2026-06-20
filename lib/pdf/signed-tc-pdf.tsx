import "server-only";

// POLISH-6 — server-side generation of a signed-T&C PDF. Uses @react-pdf's
// built-in fonts (Times-Roman serif headings evoke the brand Garamond; Helvetica
// body) so server `renderToBuffer` never trips on filesystem font loading. Navy
// + antique-gold brand colors. Embeds the client's drawn signature image.

import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
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
  terms: { fontFamily: "Times-Roman", fontSize: 9.5, lineHeight: 1.5, color: INK },
  sigBox: { marginTop: 24, borderTopWidth: 1, borderTopColor: "#E5DFD0", paddingTop: 16 },
  sigLabel: { fontFamily: "Helvetica-Bold", fontSize: 8, letterSpacing: 1, color: GOLD, textTransform: "uppercase" },
  sigName: { fontFamily: "Times-Bold", fontSize: 13, color: NAVY, marginTop: 4 },
  sigImage: { height: 70, marginTop: 8, objectFit: "contain" },
  meta: { fontSize: 8.5, color: "#5C5240", marginTop: 8 },
  token: { fontSize: 7, color: "#9A8F78", marginTop: 16 },
});

export interface SignedTcPdfInput {
  title: string;
  termsText: string;
  signerName: string;
  signatureDataUrl: string | null;
  signedAt: string; // already-formatted Toronto timestamp
  token: string;
}

function SignedTcDoc(p: SignedTcPdfInput) {
  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: styles.page, wrap: true },
      React.createElement(Text, { style: styles.eyebrow }, "Nexvelon Global · Signed Agreement"),
      React.createElement(Text, { style: styles.title }, p.title),
      React.createElement(View, { style: styles.rule }),
      React.createElement(Text, { style: styles.terms }, p.termsText || "—"),
      React.createElement(
        View,
        { style: styles.sigBox, wrap: false },
        React.createElement(Text, { style: styles.sigLabel }, "Signed by"),
        React.createElement(Text, { style: styles.sigName }, p.signerName),
        p.signatureDataUrl
          ? React.createElement(Image, { style: styles.sigImage, src: p.signatureDataUrl })
          : null,
        React.createElement(Text, { style: styles.meta }, `Signed on: ${p.signedAt}`),
        React.createElement(Text, { style: styles.token }, `Reference: ${p.token}`)
      )
    )
  );
}

export async function renderSignedTcPdf(input: SignedTcPdfInput): Promise<Buffer> {
  const buf = await renderToBuffer(SignedTcDoc(input));
  return buf as Buffer;
}
