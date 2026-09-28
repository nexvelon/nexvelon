import "server-only";

// QUOTE-PORTAL-1/2 — the client e-acceptance portal's data layer. Everything here
// runs SERVICE-ROLE (the public /q/<token> route is unauthenticated), scoped by an
// unguessable token. Reads/writes never depend on an anon grant.
//
// QP-2 model: a "send" (quote_portal_sends) holds ONE immutable snapshot + the
// SEC-1-safe render payload + delivery mode + expiry. Each To/Cc recipient is a
// row in quote_portal_recipients; only 'to' recipients carry a token (the signing
// link). One accepted 'to' recipient supersedes the other 'to' links (read-only),
// and UNIQUE(send_id) on quote_acceptances guarantees exactly one acceptance per
// send.
//
// The snapshot + the SEC-1-safe DocProps are the load-bearing safety boundary:
// they copy ONLY client-safe fields. Internal figures (unit cost, margin, notes,
// technician names, stock refs) are never included — absent, not hidden.

import { createHash, randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logQuoteAuditEvent } from "@/lib/api/quote-audit";
import { getQuoteTemplate } from "@/lib/company-profile";
import {
  buildSafeQuoteDocProps,
  renderQuotePdf,
  type QuoteRenderParties,
  type QuoteAcceptanceStamp,
} from "@/lib/pdf/render-quote";
import {
  storeQuoteDocument,
  PROPOSALS_FOLDER,
  SIGNED_FOLDER,
  fileStamp,
} from "@/lib/api/quote-documents";
import type { Quote, BuilderLineItem, QuoteSection } from "@/lib/types";
import type {
  DbQuotePortalSend,
  DbQuoteAcceptance,
  DbQuotePortalRecipient,
  QuotePortalRecipientRole,
} from "@/lib/types/database";

const PORTAL_EXPIRY_DAYS = 30; // QUOTE-PORTAL-2 item 5 (was 90 in QP-1).

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
  const rawVendor = it.vendor as unknown;
  const vendor =
    typeof rawVendor === "string"
      ? rawVendor
      : rawVendor && typeof rawVendor === "object"
        ? ((rawVendor as { name?: string }).name ?? undefined)
        : undefined;
  const line: QuoteSnapshotLine = {
    description: it.description,
    name: it.name || undefined,
    classification: it.classification,
    qty: it.qty,
    unitPrice: it.unitPrice, // safe; never unitCost/margin
    sku: it.sku || undefined,
    upc: it.upc,
    masterPartNumber: it.masterPartNumber,
    vendor,
    serialNumber: it.serialNumber,
  };
  if (it.labour?.show?.hours) line.labourHours = it.labour.hours;
  if (it.labour?.show?.rate) line.labourRate = it.labour.sellRate;
  return line;
}

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

export type DeliveryMode = "link" | "attachment";

export interface PortalRecipientInput {
  role: QuotePortalRecipientRole;
  name?: string | null;
  email: string;
  source?: string | null; // client_contact | site_contact | employee | manual
}

export interface CreatePortalSendResult {
  sendId: string;
  expiresAt: string;
  deliveryMode: DeliveryMode;
  proposalPath: string;
  proposalPdf: Buffer;
  snapshot: QuoteSnapshot;
  /** Per-recipient outcome; only 'to' recipients carry a token/link. */
  recipients: {
    id: string;
    role: QuotePortalRecipientRole;
    name: string | null;
    email: string;
    token: string | null;
  }[];
}

/** Revoke every OPEN send + recipient for a quote (a superseded link must stop
 *  working immediately — item 9). */
async function revokeOpenSends(quoteId: string): Promise<void> {
  const sb = admin();
  await sb
    .from("quote_portal_sends")
    .update({ status: "revoked" })
    .eq("quote_id", quoteId)
    .in("status", ["sent", "viewed"]);
  await sb
    .from("quote_portal_recipients")
    .update({ status: "revoked" })
    .eq("quote_id", quoteId)
    .in("status", ["sent", "viewed"]);
}

/**
 * Create a fresh multi-recipient send: capture the immutable snapshot + the
 * SEC-1-safe render payload, render + store the unsigned "Proposals" PDF, mint a
 * per-'to'-recipient token, and REVOKE all prior open links first (item 9).
 * Cc recipients never get a token (enforced by the schema too). Service-role.
 */
export async function createQuotePortalSend(input: {
  quoteId: string;
  deliveryMode: DeliveryMode;
  recipients: PortalRecipientInput[];
  parties?: QuoteRenderParties;
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

  const toRecipients = input.recipients.filter((r) => r.role === "to");
  if (toRecipients.length === 0) {
    throw new Error("At least one To recipient is required.");
  }

  // Display names (never any internal figure).
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

  // SEC-1-safe render payload → unsigned PDF, stored in "Proposals".
  const docProps = buildSafeQuoteDocProps(quote, input.parties ?? {});
  const proposalPdf = await renderQuotePdf(docProps);
  const stamp = fileStamp();
  const proposal = await storeQuoteDocument({
    quoteId: input.quoteId,
    folder: PROPOSALS_FOLDER,
    filename: `Quote_${quote.number}_${stamp}.pdf`,
    buffer: proposalPdf,
    uploadedBy: input.sentBy,
  });

  // Revoke prior open links before creating the new send (item 9).
  await revokeOpenSends(input.quoteId);

  const expiresAt = new Date(Date.now() + PORTAL_EXPIRY_DAYS * 86_400_000).toISOString();
  const { data: sendRow, error: sErr } = await sb
    .from("quote_portal_sends")
    .insert({
      quote_id: input.quoteId,
      token: null, // QP-2: links live on recipients
      snapshot,
      delivery_mode: input.deliveryMode,
      proposal_pdf_path: proposal.path,
      render_payload: docProps as unknown,
      recipient_email: toRecipients[0]?.email ?? null, // legacy display convenience
      status: "sent",
      sent_by: input.sentBy,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (sErr) throw new Error(`createQuotePortalSend/insert: ${sErr.message}`);
  const sendId = (sendRow as { id: string }).id;

  // Recipient rows — 'to' get a token; 'cc' never do (schema also enforces it).
  const recipientRows = input.recipients.map((r) => ({
    send_id: sendId,
    quote_id: input.quoteId,
    role: r.role,
    name: r.name ?? null,
    email: r.email,
    source: r.source ?? null,
    token: r.role === "to" ? randomUUID() : null,
    status: "sent",
  }));
  const { data: insertedRecipients, error: rErr } = await sb
    .from("quote_portal_recipients")
    .insert(recipientRows)
    .select("id, role, name, email, token");
  if (rErr) throw new Error(`createQuotePortalSend/recipients: ${rErr.message}`);

  await logQuoteAuditEvent({
    quoteId: input.quoteId,
    actorId: input.sentBy,
    actorName: null,
    eventType: "portal_sent",
    changes: {
      delivery: { from: null, to: input.deliveryMode },
      to: { from: null, to: toRecipients.map((r) => r.email).join(", ") },
      cc: {
        from: null,
        to: input.recipients.filter((r) => r.role === "cc").map((r) => r.email).join(", ") || null,
      },
    },
  });

  return {
    sendId,
    expiresAt,
    deliveryMode: input.deliveryMode,
    proposalPath: proposal.path,
    proposalPdf,
    snapshot,
    recipients: (insertedRecipients ?? []) as CreatePortalSendResult["recipients"],
  };
}

// ─── Portal read (client) ─────────────────────────────────────────────────────

export type PortalLookup =
  | { status: "valid"; send: DbQuotePortalSend; recipient: DbQuotePortalRecipient | null; snapshot: QuoteSnapshot; pdfPath: string | null }
  | { status: "responded"; decision: "accepted" | "declined"; snapshot: QuoteSnapshot; pdfPath: string | null }
  | { status: "superseded"; snapshot: QuoteSnapshot; pdfPath: string | null }
  | { status: "expired" }
  | { status: "revoked" }
  | { status: "not_found" };

async function loadSend(sendId: string): Promise<DbQuotePortalSend | null> {
  const { data } = await admin().from("quote_portal_sends").select("*").eq("id", sendId).maybeSingle();
  return (data as DbQuotePortalSend | null) ?? null;
}

/** Look up a token (recipient token first, then legacy send token) and, for a
 *  valid open link, record the view. Fail-closed: unknown/garbage → not_found. */
export async function getPortalByToken(token: string): Promise<PortalLookup> {
  if (!token || token.length < 8) return { status: "not_found" };
  const sb = admin();

  // QP-2: recipient token.
  const { data: recData } = await sb
    .from("quote_portal_recipients")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (recData) {
    const recipient = recData as DbQuotePortalRecipient;
    const send = await loadSend(recipient.send_id);
    if (!send) return { status: "not_found" };
    const snapshot = send.snapshot as QuoteSnapshot;
    const pdfPath = send.proposal_pdf_path;

    if (recipient.status === "revoked" || send.status === "revoked") return { status: "revoked" };
    if (recipient.status === "superseded") return { status: "superseded", snapshot, pdfPath };
    if (recipient.status === "accepted") return { status: "responded", decision: "accepted", snapshot, pdfPath };
    if (recipient.status === "declined") return { status: "responded", decision: "declined", snapshot, pdfPath };
    // If another recipient already responded, this one is read-only too.
    if (send.status === "accepted") return { status: "superseded", snapshot, pdfPath };
    if (send.status === "declined") return { status: "superseded", snapshot, pdfPath };
    if (recipient.status === "expired" || send.status === "expired" || new Date(send.expires_at) < new Date()) {
      if (recipient.status !== "expired") {
        await sb.from("quote_portal_recipients").update({ status: "expired" }).eq("id", recipient.id);
      }
      return { status: "expired" };
    }

    // Record the view on this recipient (+ send-level first view).
    const now = new Date().toISOString();
    const firstView = recipient.view_count === 0;
    await sb
      .from("quote_portal_recipients")
      .update({
        status: recipient.status === "sent" ? "viewed" : recipient.status,
        view_count: recipient.view_count + 1,
        first_viewed_at: recipient.first_viewed_at ?? now,
        last_viewed_at: now,
      })
      .eq("id", recipient.id);
    if (send.status === "sent") {
      await sb
        .from("quote_portal_sends")
        .update({ status: "viewed", first_viewed_at: send.first_viewed_at ?? now, last_viewed_at: now })
        .eq("id", send.id);
    }
    if (firstView) {
      await logQuoteAuditEvent({
        quoteId: send.quote_id,
        actorId: null,
        actorName: `${recipient.name ?? recipient.email} (portal)`,
        eventType: "portal_viewed",
        changes: {},
      });
    }
    return { status: "valid", send, recipient, snapshot, pdfPath };
  }

  // Legacy QP-1: send-level token.
  const { data: sendData } = await sb.from("quote_portal_sends").select("*").eq("token", token).maybeSingle();
  if (!sendData) return { status: "not_found" };
  const send = sendData as DbQuotePortalSend;
  const snapshot = send.snapshot as QuoteSnapshot;
  const pdfPath = send.proposal_pdf_path;
  if (send.status === "revoked") return { status: "revoked" };
  if (send.status === "accepted") return { status: "responded", decision: "accepted", snapshot, pdfPath };
  if (send.status === "declined") return { status: "responded", decision: "declined", snapshot, pdfPath };
  if (send.status === "expired" || new Date(send.expires_at) < new Date()) {
    if (send.status !== "expired") await sb.from("quote_portal_sends").update({ status: "expired" }).eq("id", send.id);
    return { status: "expired" };
  }
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
  return { status: "valid", send, recipient: null, snapshot, pdfPath };
}

// ─── Accept / decline (client) ────────────────────────────────────────────────

export interface PortalDecisionInput {
  token: string;
  decision: "accepted" | "declined";
  signerName?: string;
  signerTitle?: string;
  signerEmail?: string;
  signatureImage?: string | null;
  declineReason?: string;
  ip?: string | null;
  userAgent?: string | null;
}

export type PortalDecisionResult =
  | {
      ok: true;
      decision: "accepted" | "declined";
      quoteId: string;
      sendId: string;
      sentBy: string | null;
      signerName: string | null;
      signerEmail: string | null;
      quoteNumber: string;
      signedPdfPath: string | null;
    }
  | { ok: false; error: string };

/** Record an accept/decline against a recipient token. On accept, name + title +
 *  signature are ALL mandatory (item 3), and the countersigned PDF is generated
 *  and stored in "Signed". One response closes the send's other 'to' links
 *  (superseded). The caller (portal action) emails the signed copy + notifies. */
export async function recordPortalDecision(input: PortalDecisionInput): Promise<PortalDecisionResult> {
  const sb = admin();

  // Resolve the recipient (QP-2) or legacy send.
  const { data: recData } = await sb
    .from("quote_portal_recipients")
    .select("*")
    .eq("token", input.token)
    .maybeSingle();
  const recipient = (recData as DbQuotePortalRecipient | null) ?? null;

  let send: DbQuotePortalSend | null = null;
  if (recipient) {
    send = await loadSend(recipient.send_id);
  } else {
    const { data: sendData } = await sb.from("quote_portal_sends").select("*").eq("token", input.token).maybeSingle();
    send = (sendData as DbQuotePortalSend | null) ?? null;
  }
  if (!send) return { ok: false, error: "This link is not valid." };

  const recStatus = recipient?.status ?? send.status;
  if (recStatus === "revoked" || send.status === "revoked") return { ok: false, error: "This link has been revoked." };
  if (recStatus === "superseded" || send.status === "accepted" || send.status === "declined") {
    return { ok: false, error: "This quote has already been responded to." };
  }
  if (send.status === "expired" || new Date(send.expires_at) < new Date()) {
    return { ok: false, error: "This link has expired." };
  }

  // Item 3 — name, title and signature are ALL mandatory on accept.
  if (input.decision === "accepted") {
    if (!input.signerName?.trim()) return { ok: false, error: "Please enter your full name." };
    if (!input.signerTitle?.trim()) return { ok: false, error: "Please enter your title." };
    if (!input.signatureImage?.trim()) return { ok: false, error: "Please add your signature before submitting." };
  }

  const signedAtIso = new Date().toISOString();
  const recordHash = createHash("sha256")
    .update(
      JSON.stringify({
        decision: input.decision,
        signerName: input.signerName ?? null,
        signerTitle: input.signerTitle ?? null,
        signerEmail: input.signerEmail ?? null,
        recipientId: recipient?.id ?? null,
        snapshot: send.snapshot,
        at: signedAtIso,
      })
    )
    .digest("hex");

  // On accept, generate the countersigned PDF from the FROZEN render payload
  // (never a re-render of a since-edited quote) + the signature page, BEFORE the
  // acceptance insert (the row is append-only; signed_pdf_path is set at insert).
  let signedPdfPath: string | null = null;
  if (input.decision === "accepted") {
    const payload = send.render_payload;
    if (payload && typeof payload === "object") {
      try {
        const stamp: QuoteAcceptanceStamp = {
          name: input.signerName!.trim(),
          title: input.signerTitle!.trim(),
          email: input.signerEmail?.trim() || null,
          signedAt: signedAtIso,
          signatureImage: input.signatureImage ?? null,
          ip: input.ip ?? null,
        };
        const snap = send.snapshot as QuoteSnapshot;
        const pdf = await renderQuotePdf({ ...(payload as object), acceptance: stamp } as Parameters<typeof renderQuotePdf>[0]);
        const stored = await storeQuoteDocument({
          quoteId: send.quote_id,
          folder: SIGNED_FOLDER,
          filename: `Quote_${snap.number}_SIGNED_${fileStamp(new Date(signedAtIso))}.pdf`,
          buffer: pdf,
          uploadedBy: null,
        });
        signedPdfPath = stored.path;
      } catch (e) {
        console.error("[quote-portal] countersigned PDF generation failed:", e);
        // Non-fatal: the acceptance is still recorded; the signed PDF can be
        // regenerated later. Do not block the client's acceptance on a render.
      }
    }
  }

  const { error: accErr } = await sb.from("quote_acceptances").insert({
    send_id: send.id,
    quote_id: send.quote_id,
    recipient_id: recipient?.id ?? null,
    decision: input.decision,
    signer_name: input.signerName ?? null,
    signer_title: input.signerTitle ?? null,
    signer_email: input.signerEmail ?? null,
    signature_image: input.signatureImage ?? null,
    record_hash: recordHash,
    signed_pdf_path: signedPdfPath,
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

  // This recipient responded; the send responded; sibling 'to' links close.
  if (recipient) {
    await sb
      .from("quote_portal_recipients")
      .update({ status: input.decision, responded_at: signedAtIso })
      .eq("id", recipient.id);
    await sb
      .from("quote_portal_recipients")
      .update({ status: "superseded" })
      .eq("send_id", send.id)
      .eq("role", "to")
      .in("status", ["sent", "viewed"])
      .neq("id", recipient.id);
  }
  await sb
    .from("quote_portal_sends")
    .update({
      status: input.decision,
      responded_at: signedAtIso,
      decline_reason: input.decision === "declined" ? input.declineReason ?? null : null,
    })
    .eq("id", send.id);

  // Quote status: accepted → Approved; declined → Revision.
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
    actorName: input.signerName?.trim() || recipient?.email || "Client (portal)",
    eventType: input.decision === "accepted" ? "portal_accepted" : "portal_declined",
    changes:
      input.decision === "declined" && input.declineReason
        ? { reason: { from: null, to: input.declineReason } }
        : {},
  });

  const snap = send.snapshot as QuoteSnapshot;
  return {
    ok: true,
    decision: input.decision,
    quoteId: send.quote_id,
    sendId: send.id,
    sentBy: send.sent_by,
    signerName: input.signerName?.trim() || null,
    signerEmail: input.signerEmail?.trim() || null,
    quoteNumber: snap.number,
    signedPdfPath,
  };
}

// ─── Operator read ────────────────────────────────────────────────────────────

export interface QuotePortalSendView {
  send: DbQuotePortalSend;
  recipients: DbQuotePortalRecipient[];
  acceptance: DbQuoteAcceptance | null;
}
export interface QuotePortalOverview {
  latest: QuotePortalSendView | null;
  history: QuotePortalSendView[]; // newest first, includes latest
}

/** Full operator view: every send with its recipients + acceptance, newest
 *  first (prior sends/acceptances remain visible as history — item 9). */
export async function getQuotePortalOverview(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  quoteId: string
): Promise<QuotePortalOverview> {
  const { data: sends } = await supabase
    .from("quote_portal_sends")
    .select("*")
    .eq("quote_id", quoteId)
    .order("sent_at", { ascending: false });
  const sendRows = (sends ?? []) as DbQuotePortalSend[];
  if (sendRows.length === 0) return { latest: null, history: [] };

  const sendIds = sendRows.map((s) => s.id);
  const { data: recips } = await supabase
    .from("quote_portal_recipients")
    .select("*")
    .in("send_id", sendIds);
  const { data: accs } = await supabase
    .from("quote_acceptances")
    .select("*")
    .in("send_id", sendIds);
  const recipientsBySend = new Map<string, DbQuotePortalRecipient[]>();
  for (const r of (recips ?? []) as DbQuotePortalRecipient[]) {
    const arr = recipientsBySend.get(r.send_id) ?? [];
    arr.push(r);
    recipientsBySend.set(r.send_id, arr);
  }
  const acceptanceBySend = new Map<string, DbQuoteAcceptance>();
  for (const a of (accs ?? []) as DbQuoteAcceptance[]) acceptanceBySend.set(a.send_id, a);

  const history: QuotePortalSendView[] = sendRows.map((send) => ({
    send,
    recipients: recipientsBySend.get(send.id) ?? [],
    acceptance: acceptanceBySend.get(send.id) ?? null,
  }));
  return { latest: history[0] ?? null, history };
}

// ─── Admin hard-delete of an acceptance (item 10; owner override of §2.2) ──────

export interface DeleteAcceptanceResult {
  ok: boolean;
  error?: string;
}

/** PERMANENTLY delete an acceptance record. The caller MUST have already verified
 *  the actor is an Admin. The deletion itself is audited to quote_audit_log (who,
 *  when, which quote, which signer, when it was signed) so the FACT of removal
 *  persists even though the record is gone. Service-role. */
export async function deleteAcceptance(input: {
  acceptanceId: string;
  adminId: string | null;
  adminName: string | null;
}): Promise<DeleteAcceptanceResult> {
  const sb = admin();
  const { data, error } = await sb
    .from("quote_acceptances")
    .select("*")
    .eq("id", input.acceptanceId)
    .maybeSingle();
  if (error) throw new Error(`deleteAcceptance/lookup: ${error.message}`);
  const acc = (data as DbQuoteAcceptance | null) ?? null;
  if (!acc) return { ok: false, error: "Acceptance not found." };

  const { error: delErr } = await sb.from("quote_acceptances").delete().eq("id", input.acceptanceId);
  if (delErr) throw new Error(`deleteAcceptance/delete: ${delErr.message}`);

  await logQuoteAuditEvent({
    quoteId: acc.quote_id,
    actorId: input.adminId,
    actorName: input.adminName,
    eventType: "acceptance_deleted",
    changes: {
      acceptance_id: { from: acc.id, to: null },
      signer: { from: acc.signer_name ?? acc.signer_email ?? "(unknown)", to: null },
      decision: { from: acc.decision, to: null },
      signed_at: { from: acc.accepted_at, to: null },
    },
  });
  return { ok: true };
}
