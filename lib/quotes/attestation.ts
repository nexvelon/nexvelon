// QUOTE-PORTAL-3 item 1 — the single source of the acceptance attestation wording.
// Shared by the client portal (what the signer sees) and the server (what gets
// stored on the acceptance record), so the stored wording is provably the exact
// wording shown. NOT "use client" / "server-only" — it must import on both sides.
//
// If the wording ever changes, past acceptances keep the text stored at signing
// time (quote_acceptances.attestation_text), so an old acceptance still proves
// what THAT signer agreed to.

export function buildAttestationText(clientName?: string | null): string {
  const who = clientName?.trim() || "the client";
  return `I am authorised to accept this quote on behalf of ${who}, and I agree to the pricing and terms shown above.`;
}
