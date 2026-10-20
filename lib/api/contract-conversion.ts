import "server-only";

// RECUR-2 — quote → service-contract conversion (2c/2d/2e). The pattern follows
// PROJ-1's quote → project conversion, with three deliberate differences:
//   1. It reads the quote SERVER-SIDE by id (never trusts a client-passed blob).
//   2. It is GATED ON A SIGNED PORTAL ACCEPTANCE and builds the contract from the
//      recurring terms frozen in that acceptance's snapshot — not from the live,
//      editable quote. What the client signed is exactly what gets billed (§2.2).
//   3. It is idempotent at the database: UNIQUE(service_contracts.source_quote_id)
//      means a quote can produce one contract, however many clicks race.
//
// Conversion is a DELIBERATE operator action, never automatic on acceptance —
// the same call QUOTE-PORTAL-1 made for project conversion: the operator confirms
// the real service start date and billing mode (neither is the client's to set),
// and a mistaken acceptance can be caught before an invoice exists.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { businessDatePlusDaysISO } from "@/lib/format";
import { nextBillingDateAfter } from "@/lib/recurring/billing-schedule";
import {
  contractConversionBlockers,
  contractLinesFromSnapshot,
  oneTimeInvoiceLines,
  termEndDate,
  type ConversionBlocker,
  type RecurringTermsSnapshot,
} from "@/lib/recurring/quote-terms";
import { normalizeLateFeeTerms } from "@/lib/recurring/late-fees";
import { createOneOffInvoice } from "@/lib/api/invoices";
import { logActivity } from "@/lib/api/activity-log";
import { logQuoteAuditEvent } from "@/lib/api/quote-audit";
import type { Quote } from "@/lib/types";
import type { QuoteSnapshot } from "@/lib/api/quote-portal";
import type {
  DbQuoteAcceptance,
  DbServiceContract,
  ServiceContractBillingMode,
} from "@/lib/types/database";

const round2 = (n: number): number => Math.round(n * 100) / 100;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const BILLING_MODES: ServiceContractBillingMode[] = ["manual", "automatic", "draft_for_approval"];

async function db() {
  return createSupabaseServerClient();
}

export interface ConversionPermissions {
  canConvert: boolean;
  canManageContracts: boolean;
}

export interface ContractConversionState {
  quote: {
    id: string;
    number: string;
    name: string | null;
    status: string;
    clientId: string;
    siteId: string | null;
    templateSlug: string;
  };
  acceptance: {
    id: string;
    sendId: string;
    signerName: string | null;
    signerTitle: string | null;
    acceptedAt: string;
    signedPdfPath: string | null;
    recordHash: string | null;
  } | null;
  /** The recurring terms the client SIGNED (null if not accepted / legacy). */
  signedTerms: RecurringTermsSnapshot | null;
  /** The one-time component as signed (sections + discount + setup). */
  oneTimeLines: { description: string; amount: number }[];
  oneTimeSubtotal: number;
  existingContract: { id: string; name: string } | null;
  blockers: ConversionBlocker[];
}

export class ContractConversionError extends Error {}

/** Everything the conversion dialog needs, including every reason it can't run. */
export async function getContractConversionState(
  quoteId: string,
  perms: ConversionPermissions
): Promise<ContractConversionState | null> {
  const supabase = await db();
  const { data: qRow, error: qErr } = await supabase
    .from("quotes")
    .select("id, data, client_id, site_id")
    .eq("id", quoteId)
    .maybeSingle();
  if (qErr) throw new Error(`conversionState/quote: ${qErr.message}`);
  if (!qRow) return null;
  const row = qRow as { id: string; data: Quote; client_id: string | null; site_id: string | null };
  const quote = row.data;

  // The most recent ACCEPTED portal acceptance + the snapshot it signed.
  const { data: accRows, error: aErr } = await supabase
    .from("quote_acceptances")
    .select("*")
    .eq("quote_id", quoteId)
    .eq("decision", "accepted")
    .order("accepted_at", { ascending: false })
    .limit(1);
  if (aErr) throw new Error(`conversionState/acceptance: ${aErr.message}`);
  const acc = ((accRows ?? []) as DbQuoteAcceptance[])[0] ?? null;

  let snapshot: QuoteSnapshot | null = null;
  if (acc) {
    const { data: send, error: sErr } = await supabase
      .from("quote_portal_sends")
      .select("id, snapshot")
      .eq("id", acc.send_id)
      .maybeSingle();
    if (sErr) throw new Error(`conversionState/send: ${sErr.message}`);
    snapshot = ((send as { snapshot: QuoteSnapshot } | null)?.snapshot ?? null) as QuoteSnapshot | null;
  }
  const signedTerms = (snapshot?.recurring ?? null) as RecurringTermsSnapshot | null;

  const { data: existing, error: eErr } = await supabase
    .from("service_contracts")
    .select("id, name")
    .eq("source_quote_id", quoteId)
    .limit(1);
  if (eErr) throw new Error(`conversionState/existing: ${eErr.message}`);
  const existingContract = ((existing ?? []) as { id: string; name: string }[])[0] ?? null;

  const oneTimeLines = snapshot
    ? oneTimeInvoiceLines(
        {
          sections: snapshot.sections ?? [],
          subtotal: snapshot.subtotal,
          discount: snapshot.discount,
          discountType: snapshot.discountType,
        },
        signedTerms?.setup ?? null
      )
    : [];

  return {
    quote: {
      id: quote.id,
      number: quote.number,
      name: quote.name ?? null,
      status: quote.status,
      clientId: row.client_id ?? quote.clientId,
      siteId: row.site_id ?? quote.siteId ?? null,
      templateSlug: quote.templateSlug ?? "integrated_solutions",
    },
    acceptance: acc
      ? {
          id: acc.id,
          sendId: acc.send_id,
          signerName: acc.signer_name,
          signerTitle: acc.signer_title,
          acceptedAt: acc.accepted_at,
          signedPdfPath: acc.signed_pdf_path,
          recordHash: acc.record_hash,
        }
      : null,
    signedTerms,
    oneTimeLines,
    oneTimeSubtotal: round2(oneTimeLines.reduce((s, l) => s + l.amount, 0)),
    existingContract,
    blockers: contractConversionBlockers({
      quote: { status: quote.status, intendedTargetKind: quote.intendedTargetKind, contractId: quote.contractId },
      acceptance: acc ? { decision: acc.decision } : null,
      signedTerms,
      existingContractId: existingContract?.id ?? null,
      canConvert: perms.canConvert,
      canManageContracts: perms.canManageContracts,
    }),
  };
}

export interface ConversionDecisions {
  /** The real service start date (YYYY-MM-DD) — the operator confirms it. */
  startDate: string;
  billingMode: ServiceContractBillingMode;
  name?: string;
  /** Activate now (billing starts on schedule) or leave as a draft contract. */
  activate: boolean;
  /** Raise a draft one-off invoice for the one-time component. */
  createOneTimeInvoice: boolean;
}

export interface ConversionResult {
  contract: DbServiceContract;
  oneTimeInvoiceId: string | null;
  /** Non-fatal follow-ups the operator must see (e.g. the one-off invoice failed). */
  warnings: string[];
}

/**
 * Convert an ACCEPTED service-contract quote into a service contract. Re-checks
 * every gate server-side; throws ContractConversionError with the plain-language
 * reason(s) when it can't.
 */
export async function convertQuoteToContract(
  quoteId: string,
  decisions: ConversionDecisions,
  actor: { id: string; name: string | null },
  perms: ConversionPermissions
): Promise<ConversionResult> {
  const state = await getContractConversionState(quoteId, perms);
  if (!state) throw new ContractConversionError("Quote not found.");
  if (state.blockers.length > 0) {
    throw new ContractConversionError(state.blockers.map((b) => b.message).join(" "));
  }
  const rec = state.signedTerms as RecurringTermsSnapshot; // non-null: no blockers
  const acc = state.acceptance!; // non-null: no blockers

  if (!ISO_DATE.test(decisions.startDate ?? "")) {
    throw new ContractConversionError("Choose the date the service starts.");
  }
  if (!BILLING_MODES.includes(decisions.billingMode)) {
    throw new ContractConversionError("Choose how invoices are generated.");
  }
  // 2e — the billing entity is the entity the client signed with. The send gate
  // and builder already require Guardian; this is the server backstop.
  if (rec.opco !== state.quote.templateSlug) {
    throw new ContractConversionError(
      "The signed terms name a different company than this quote's letterhead. Re-send the quote for signature."
    );
  }

  const name =
    decisions.name?.trim() || state.quote.name?.trim() || `Service contract — quote ${state.quote.number}`;
  const endDate = termEndDate(decisions.startDate, rec.termMonths);
  const status = decisions.activate ? "active" : "draft";
  const nextBilling = decisions.activate
    ? nextBillingDateAfter(
        decisions.startDate,
        rec.cadence,
        null,
        rec.billingTiming,
        businessDatePlusDaysISO(-1),
        endDate
      )
    : null;
  const lateFee = normalizeLateFeeTerms(rec.lateFee);

  const supabase = await db();
  const { data: created, error } = await supabase
    .from("service_contracts")
    .insert({
      opco: rec.opco,
      client_id: state.quote.clientId,
      site_id: state.quote.siteId,
      name,
      status,
      cadence: rec.cadence,
      custom_interval_days: null,
      billing_timing: rec.billingTiming,
      billing_mode: decisions.billingMode,
      start_date: decisions.startDate,
      end_date: endDate,
      next_billing_date: nextBilling,
      tax_rate: rec.taxRatePct,
      tax_exempt: false,
      notes: `Created from accepted quote ${state.quote.number}.`,
      created_by: actor.id,
      updated_by: actor.id,
      // 2d — durable link + frozen evidence.
      source_quote_id: state.quote.id,
      source_send_id: acc.sendId,
      source_acceptance_id: acc.id,
      source_quote_number: state.quote.number,
      source_signed_by: acc.signerName,
      source_signed_at: acc.acceptedAt,
      source_signed_pdf_path: acc.signedPdfPath,
      source_record_hash: acc.recordHash,
      source_terms: rec,
      // 2f — the terms the client signed.
      payment_terms_days: rec.paymentTermsDays,
      late_fee_mode: lateFee.mode,
      late_fee_monthly_pct: lateFee.monthlyPct ?? null,
      late_fee_flat_amount: lateFee.flatAmount ?? null,
      late_fee_grace_days: lateFee.graceDays ?? 0,
    })
    .select("*")
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new ContractConversionError("This quote has already been converted to a service contract.");
    }
    throw new Error(`convertQuoteToContract/insert: ${error.message}`);
  }
  const contract = created as DbServiceContract;

  const lines = contractLinesFromSnapshot(rec);
  const { error: lErr } = await supabase.from("service_contract_lines").insert(
    lines.map((l, i) => ({ contract_id: contract.id, description: l.description, amount: l.amount, sort_order: i }))
  );
  if (lErr) {
    // A contract with no pricing lines would bill $0 AND block a retry (unique
    // source_quote_id). It is seconds old with nothing hung off it — remove it so
    // the operator can simply try again.
    await supabase.from("service_contracts").delete().eq("id", contract.id);
    throw new Error(`convertQuoteToContract/lines: ${lErr.message}`);
  }

  const warnings: string[] = [];

  // Lock the quote: Converted + the server-owned contract link. The contract
  // already exists (and the unique index blocks a second one), so a failure here
  // is reported loud rather than unwinding the contract.
  const { data: qRow } = await supabase.from("quotes").select("data").eq("id", quoteId).maybeSingle();
  const liveQuote = (qRow as { data: Quote } | null)?.data;
  if (liveQuote) {
    const { error: qErr } = await supabase
      .from("quotes")
      .update({ status: "Converted", data: { ...liveQuote, status: "Converted", contractId: contract.id } })
      .eq("id", quoteId);
    if (qErr) {
      console.error(`[recur-2/convert] quote ${quoteId} lock failed:`, qErr.message);
      warnings.push("The contract was created, but the quote couldn't be marked Converted. Refresh and check it.");
    }
  }

  // The one-time component (2b) — billed ONCE, by the same signing entity (2e).
  let oneTimeInvoiceId: string | null = null;
  if (decisions.createOneTimeInvoice && state.oneTimeLines.length > 0) {
    try {
      const inv = await createOneOffInvoice({
        opco: rec.opco,
        clientId: state.quote.clientId,
        siteId: state.quote.siteId,
        taxRatePct: rec.taxRatePct,
        notes: `One-time items from accepted quote ${state.quote.number} (service contract: ${name}).`,
        lines: state.oneTimeLines,
      });
      oneTimeInvoiceId = inv.id;
    } catch (e) {
      console.error(`[recur-2/convert] one-time invoice failed for quote ${quoteId}:`, e);
      warnings.push(
        "The one-time items couldn't be invoiced automatically — create that invoice by hand so they aren't missed."
      );
    }
  }

  // §5 — the conversion writes an activity row on the contract and an audit event
  // on the quote.
  await logActivity(
    "service_contract",
    contract.id,
    "create",
    {
      from_quote: { from: null, to: state.quote.number },
      signed_by: { from: null, to: acc.signerName ?? "(unnamed signer)" },
      signed_at: { from: null, to: acc.acceptedAt },
      cadence: { from: null, to: rec.cadence },
      period_amount: { from: null, to: `$${rec.periodTotal.toFixed(2)}` },
      status: { from: null, to: status },
      ...(oneTimeInvoiceId ? { one_time_invoice: { from: null, to: oneTimeInvoiceId } } : {}),
    },
    { entityLabel: name, parentType: "client", parentId: state.quote.clientId }
  );
  await logQuoteAuditEvent({
    quoteId,
    actorId: actor.id,
    actorName: actor.name,
    eventType: "converted_to_contract",
    changes: {
      status: { from: state.quote.status, to: "Converted" },
      contract: { from: null, to: name },
    },
  });

  return { contract, oneTimeInvoiceId, warnings };
}
