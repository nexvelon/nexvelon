import "server-only";

// QUOTE-PORTAL-1 — the client e-acceptance portal's data layer. Everything here
// runs SERVICE-ROLE (the public /q/<token> route is unauthenticated), scoped by the
// unguessable token — the client-invitations pattern (0056). Reads/writes never
// depend on an anon grant.
//
// The snapshot (buildQuoteSnapshot) is the load-bearing safety boundary: it copies
// ONLY client-safe fields out of the quote. Internal figures (unit cost, margin,
// internal notes, technician names, stock refs) are never included — not hidden,
// absent — so no SEC-1-gated field can reach the portal even in principle.

import { createHash, randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logQuoteAuditEvent } from "@/lib/api/quote-audit";
import { getQuoteTemplate } from "@/lib/company-profile";
import type { Quote, BuilderLineItem, QuoteSection } from "@/lib/types";
import type { DbQuotePortalSend, DbQuoteAcceptance } from "@/lib/types/database";

const PORTAL_EXPIRY_DAYS = 90; // design default; confirmed.

function admin() {
  return createAdminClient();
}

// ─── The client-safe snapshot ─────────────────────────────────────────────────

export interface QuoteSnapshotLine {
  description: string;
  name?: string;
  classification?: string;
  qty: number;
  unitPrice: number; // selling price — NOT cost-derived (SEC-1 safe)
  sku?: string;
  upc?: string;
  masterPartNumber?: string;
  vendor?: string;
  serialNumber?: string;
  // Labour hours/rate only when the per-line show flags opt in.
  labourHours?: number;
  labourRate?: number;
}
export interface QuoteSnapshotSection {
  name: string;
  items: QuoteSnapshotLine[];
}
export interface QuoteSnapshot {
  capturedAt: string;
  number: string;
  name?: string;
  quoteDate?: string;
  expiresAt: string;
  preparedBy?: string;
  paymentTerms?: string;
  taxRate?: number;
  clientName?: string;
  siteName?: string;
  companyLegalName?: string;
  sections: QuoteSnapshotSection[];
  show: {
    unitPrice: boolean;
    sku: boolean;
    upc: boolean;
    masterPart: boolean;
    vendor: boolean;
    name: boolean;
    description: boolean;
  };
  subtotal: number;
  discount?: number;
  discountType?: "pct" | "amount";
  tax: number;
  total: number;
  terms?: string;
}

function snapshotLine(it: BuilderLineItem): QuoteSnapshotLine {
  const line: QuoteSnapshotLine = {
    description: it.description,
    name: it.name || undefined,
    classification: it.classification,
    qty: it.qty,
    unitPrice: it.unitPrice, // safe; never unitCost/margin
    sku: it.sku || undefined,
    upc: it.upc,
    masterPartNumber: it.masterPartNumber,
    vendor: it.vendor,
    serialNumber: it.serialNumber,
  };
  // Labour hours/rate only if the line opts in; techName is NEVER copied.
  if (it.labour?.show?.hours) line.labourHours = it.labour.hours;
  if (it.labour?.show?.rate) line.labourRate = it.labour.sellRate;
  return line;
}

/**
 * Project a quote to the client-safe snapshot. Reads ONLY the safe fields — unit
 * cost, margin, internal notes, technician names, stock/commit refs and ownership
 * are simply never read, so they cannot appear in the stored jsonb.
 */
export function buildQuoteSnapshot(
  quote: Quote,
  extras: { clientName?: string | null; siteName?: string | null; companyLegalName?: string | null } = {}
): QuoteSnapshot {
  const sections: QuoteSnapshotSection[] = (quote.sections ?? []).map((s: QuoteSection) => ({
    name: s.name,
    items: s.items.map(snapshotLine),
  }));
  return {
    capturedAt: new Date().toISOString(),
    number: quote.number,
    name: quote.name,
    quoteDate: quote.quoteDate,
    expiresAt: quote.expiresAt,
    preparedBy: quote.preparedBy,
    paymentTerms: quote.paymentTerms,
    taxRate: quote.taxRate,
    clientName: extras.clientName ?? undefined,
    siteName: extras.siteName ?? undefined,
    companyLegalName: extras.companyLegalName ?? undefined,
    sections,
    show: {
      unitPrice: quote.showUnitPrice ?? true,
      sku: quote.showSku ?? false,
      upc: quote.showUpc ?? false,
      masterPart: quote.showMasterPart ?? false,
      vendor: quote.showVendor ?? false,
      name: quote.showName ?? true,
      description: quote.showDescription ?? true,
    },
    subtotal: quote.subtotal,
    discount: quote.discount,
    discountType: quote.discountType,
    tax: quote.tax,
    total: quote.total,
    terms: quote.terms,
  };
}

// ─── Send (operator → client) ─────────────────────────────────────────────────

export interface CreatePortalSendResult {
  token: string;
  sendId: string;
  expiresAt: string;
}

/** Create a fresh send: capture the immutable snapshot + mint a token. Any prior
 *  open send for the quote is REVOKED so a revised quote can't be accepted under an
 *  old link (2a). Service-role. */
export async function createQuotePortalSend(input: {
  quoteId: string;
  recipientEmail: string | null;
  sentBy: string | null;
}): Promise<CreatePortalSendResult> {
  const sb = admin();
  const { data: qRow, error: qErr } = await sb
    .from("quotes")
    .select("data")
    .eq("id", input.quoteId)
    .maybeSingle();
  if (qErr) throw new Error(`createQuotePortalSend/quote: ${qErr.message}`);
  if (!qRow) throw new Error("Quote not found.");
  const quote = (qRow as { data: Quote }).data;

  // Resolve display names (never any internal figure).
  let clientName: string | null = null;
  let siteName: string | null = null;
  if (quote.clientId) {
    const { data } = await sb.from("clients").select("name").eq("id", quote.clientId).maybeSingle();
    clientName = (data as { name: string } | null)?.name ?? null;
  }
  if (quote.siteId) {
    const { data } = await sb.from("sites").select("name").eq("id", quote.siteId).maybeSingle();
    siteName = (data as { name: string } | null)?.name ?? null;
  }
  const companyLegalName = (() => {
    try {
      return getQuoteTemplate(quote.templateSlug ?? "integrated_solutions").legalName;
    } catch {
      return null;
    }
  })();

  const snapshot = buildQuoteSnapshot(quote, { clientName, siteName, companyLegalName });

  // Revoke prior open sends for this quote (an old link must stop working).
  await sb
    .from("quote_portal_sends")
    .update({ status: "revoked" })
    .eq("quote_id", input.quoteId)
    .in("status", ["sent", "viewed"]);

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + PORTAL_EXPIRY_DAYS * 86_400_000).toISOString();
  const { data: sendRow, error: sErr } = await sb
    .from("quote_portal_sends")
    .insert({
      quote_id: input.quoteId,
      token,
      snapshot,
      recipient_email: input.recipientEmail,
      status: "sent",
      sent_by: input.sentBy,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (sErr) throw new Error(`createQuotePortalSend/insert: ${sErr.message}`);

  await logQuoteAuditEvent({
    quoteId: input.quoteId,
    actorId: input.sentBy,
    actorName: null,
    eventType: "portal_sent",
    changes: { recipient: { from: null, to: input.recipientEmail ?? "(link)" } },
  });

  return { token, sendId: (sendRow as { id: string }).id, expiresAt };
}

// ─── Portal read (client) ─────────────────────────────────────────────────────

export type PortalLookup =
  | { status: "valid"; send: DbQuotePortalSend; snapshot: QuoteSnapshot }
  | { status: "responded"; decision: "accepted" | "declined"; snapshot: QuoteSnapshot }
  | { status: "expired" }
  | { status: "revoked" }
  | { status: "not_found" };

/** Look up a token and, for a valid open send, record the view. Fail-closed: an
 *  unknown/garbage token returns "not_found" and reveals nothing. */
export async function getPortalByToken(token: string): Promise<PortalLookup> {
  if (!token || token.length < 8) return { status: "not_found" };
  const sb = admin();
  const { data, error } = await sb
    .from("quote_portal_sends")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(`getPortalByToken: ${error.message}`);
  if (!data) return { status: "not_found" };
  const send = data as DbQuotePortalSend;
  const snapshot = send.snapshot as QuoteSnapshot;

  if (send.status === "revoked") return { status: "revoked" };
  if (send.status === "accepted") return { status: "responded", decision: "accepted", snapshot };
  if (send.status === "declined") return { status: "responded", decision: "declined", snapshot };
  if (send.status === "expired" || new Date(send.expires_at) < new Date()) {
    if (send.status !== "expired") {
      await sb.from("quote_portal_sends").update({ status: "expired" }).eq("id", send.id);
    }
    return { status: "expired" };
  }

  // Record the view (idempotent-ish counter; first view logs an event).
  const now = new Date().toISOString();
  const firstView = send.view_count === 0;
  await sb
    .from("quote_portal_sends")
    .update({
      status: send.status === "sent" ? "viewed" : send.status,
      view_count: send.view_count + 1,
      first_viewed_at: send.first_viewed_at ?? now,
      last_viewed_at: now,
    })
    .eq("id", send.id);
  if (firstView) {
    await logQuoteAuditEvent({
      quoteId: send.quote_id,
      actorId: null,
      actorName: "Client (portal)",
      eventType: "portal_viewed",
      changes: {},
    });
  }
  return { status: "valid", send, snapshot };
}

// ─── Accept / decline (client) ────────────────────────────────────────────────

export interface PortalDecisionInput {
  token: string;
  decision: "accepted" | "declined";
  signerName?: string;
  signerTitle?: string;
  signerEmail?: string;
  signatureImage?: string | null; // drawn-signature data URL (optional)
  declineReason?: string;
  ip?: string | null;
  userAgent?: string | null;
}

export type PortalDecisionResult =
  | { ok: true }
  | { ok: false; error: string };

/** Record an accept/decline. Append-only acceptance row + send status update +
 *  quote status transition + audit. Guards against a second response (UNIQUE
 *  send_id + status check). Service-role. Conversion to a project is NOT done here
 *  — it stays a deliberate operator action. */
export async function recordPortalDecision(
  input: PortalDecisionInput
): Promise<PortalDecisionResult> {
  const sb = admin();
  const { data, error } = await sb
    .from("quote_portal_sends")
    .select("*")
    .eq("token", input.token)
    .maybeSingle();
  if (error) throw new Error(`recordPortalDecision/lookup: ${error.message}`);
  if (!data) return { ok: false, error: "This link is not valid." };
  const send = data as DbQuotePortalSend;

  if (send.status === "revoked") return { ok: false, error: "This link has been revoked." };
  if (send.status === "accepted" || send.status === "declined") {
    return { ok: false, error: "This quote has already been responded to." };
  }
  if (send.status === "expired" || new Date(send.expires_at) < new Date()) {
    return { ok: false, error: "This link has expired." };
  }
  if (input.decision === "accepted" && !input.signerName?.trim()) {
    return { ok: false, error: "Please type your name to sign." };
  }

  // Tamper seal over the canonical acceptance payload.
  const recordHash = createHash("sha256")
    .update(
      JSON.stringify({
        decision: input.decision,
        signerName: input.signerName ?? null,
        signerTitle: input.signerTitle ?? null,
        signerEmail: input.signerEmail ?? null,
        snapshot: send.snapshot,
        at: new Date().toISOString(),
      })
    )
    .digest("hex");

  // Append the immutable acceptance record. UNIQUE(send_id) rejects a second one.
  const { error: accErr } = await sb.from("quote_acceptances").insert({
    send_id: send.id,
    quote_id: send.quote_id,
    decision: input.decision,
    signer_name: input.signerName ?? null,
    signer_title: input.signerTitle ?? null,
    signer_email: input.signerEmail ?? null,
    signature_image: input.signatureImage ?? null,
    record_hash: recordHash,
    decline_reason: input.decision === "declined" ? input.declineReason ?? null : null,
    ip: input.ip ?? null,
    user_agent: input.userAgent ?? null,
  });
  if (accErr) {
    if ((accErr as { code?: string }).code === "23505") {
      return { ok: false, error: "This quote has already been responded to." };
    }
    throw new Error(`recordPortalDecision/insert: ${accErr.message}`);
  }

  // Update the send's response state.
  await sb
    .from("quote_portal_sends")
    .update({
      status: input.decision,
      responded_at: new Date().toISOString(),
      decline_reason: input.decision === "declined" ? input.declineReason ?? null : null,
    })
    .eq("id", send.id);

  // Transition the quote so the operator sees the outcome in the list:
  //   accepted → Approved; declined → Revision (needs the operator's next move).
  const newQuoteStatus = input.decision === "accepted" ? "Approved" : "Revision";
  const { data: qRow } = await sb.from("quotes").select("data").eq("id", send.quote_id).maybeSingle();
  if (qRow) {
    const quote = (qRow as { data: Quote }).data;
    await sb
      .from("quotes")
      .update({ status: newQuoteStatus, data: { ...quote, status: newQuoteStatus } })
      .eq("id", send.quote_id);
  }

  await logQuoteAuditEvent({
    quoteId: send.quote_id,
    actorId: null,
    actorName: input.signerName?.trim() || "Client (portal)",
    eventType: input.decision === "accepted" ? "portal_accepted" : "portal_declined",
    changes:
      input.decision === "declined" && input.declineReason
        ? { reason: { from: null, to: input.declineReason } }
        : {},
  });

  return { ok: true };
}

// ─── Operator read ────────────────────────────────────────────────────────────

export interface QuotePortalStatus {
  latest: DbQuotePortalSend | null;
  acceptance: DbQuoteAcceptance | null;
}

/** The portal status for a quote (operator side). Reads the portal tables directly
 *  (authenticated SELECT), so any operator who can see the quote sees view/accept/
 *  decline — not only Admins (quote_audit_log SELECT is admin-only). */
export async function getQuotePortalStatus(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  quoteId: string
): Promise<QuotePortalStatus> {
  const { data: sends } = await supabase
    .from("quote_portal_sends")
    .select("*")
    .eq("quote_id", quoteId)
    .order("sent_at", { ascending: false })
    .limit(1);
  const latest = ((sends ?? []) as DbQuotePortalSend[])[0] ?? null;
  let acceptance: DbQuoteAcceptance | null = null;
  if (latest) {
    const { data: acc } = await supabase
      .from("quote_acceptances")
      .select("*")
      .eq("send_id", latest.id)
      .maybeSingle();
    acceptance = (acc as DbQuoteAcceptance | null) ?? null;
  }
  return { latest, acceptance };
}
