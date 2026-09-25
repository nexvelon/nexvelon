import "server-only";

// RECUR-1 — the recurring-invoice generation engine. Deliberately CLIENT-AGNOSTIC:
// it takes a Supabase client so the SAME logic serves both callers —
//   • the secured cron (service-role admin client, no session) — automatic +
//     draft_for_approval contracts, and
//   • an operator "generate now" (cookie client, has session) — a single manual
//     contract on demand.
//
// Guarantees:
//   • IDEMPOTENT — a period is claimed in service_contract_invoices (UNIQUE
//     (contract_id, period_start)); a re-run finds the claim and skips (or completes
//     a claim whose invoice failed to build). A period can NEVER be billed twice.
//   • CATCH-UP — billing runs are computed from the anchor via billingRuns(asOf), so
//     a scheduler that missed days bills every missed period, not just the latest.
//   • LOUD — a contract/run that fails is logged (console.error) and counted, never
//     silently swallowed; other contracts still generate.
//   • AUDITED — every generated invoice writes an activity_log row (via the passed
//     client, so it works under the admin client where logActivity's cookie path
//     cannot). §5.

import { round2 } from "@/lib/quote-helpers";
import { formatInvoiceNumber, businessDateISO } from "@/lib/format";
import {
  billingRuns,
  nextBillingDateAfter,
  type BillingRun,
} from "@/lib/recurring/billing-schedule";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbServiceContract, DbServiceContractLine } from "@/lib/types/database";

// Loose client type — accepts the cookie-bound server client AND the service-role
// admin client. Both expose .from/.rpc.
type Client = SupabaseClient;

export interface GenerateResult {
  asOf: string;
  contractsConsidered: number;
  generated: number; // invoices created (draft or issued)
  issued: number; // of those, issued immediately (automatic mode)
  skipped: number; // periods already billed
  failed: number; // runs that errored
  errors: string[];
}

interface GenerateOptions {
  asOf?: string;
  actorId?: string | null;
  /** Restrict to one contract (the operator "generate now" path). */
  contractId?: string;
  /** Include billing_mode='manual' contracts. The cron passes false; the operator
   *  "generate now" passes true for the one contract they clicked. */
  includeManual?: boolean;
}

function invoiceMoney(lineAmounts: number[], taxRate: number, taxExempt: boolean) {
  const subtotal = round2(lineAmounts.reduce((s, a) => s + a, 0));
  const tax = taxExempt ? 0 : round2((subtotal * taxRate) / 100);
  const total = round2(subtotal + tax);
  return { subtotal, tax, total, amount_due: total }; // contracts carry no holdback
}

/**
 * Generate every due recurring invoice as of `asOf`. Returns a summary; never
 * throws for a single-contract failure (those are caught + counted).
 */
export async function generateDueContractInvoices(
  supabase: Client,
  opts: GenerateOptions = {}
): Promise<GenerateResult> {
  const asOf = opts.asOf ?? businessDateISO();
  const actorId = opts.actorId ?? null;
  const result: GenerateResult = {
    asOf,
    contractsConsidered: 0,
    generated: 0,
    issued: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  let q = supabase.from("service_contracts").select("*").eq("status", "active");
  if (opts.contractId) q = q.eq("id", opts.contractId);
  if (!opts.includeManual) q = q.neq("billing_mode", "manual");
  const { data, error } = await q;
  if (error) throw new Error(`generate/loadContracts: ${error.message}`);
  const contracts = (data ?? []) as DbServiceContract[];
  result.contractsConsidered = contracts.length;

  for (const c of contracts) {
    try {
      const runs = billingRuns(
        c.start_date,
        c.cadence,
        c.custom_interval_days,
        c.billing_timing,
        asOf
      ).filter((r) => !c.end_date || r.billingDate <= c.end_date);

      // Snapshot the contract's CURRENT lines once per contract (§2.2 — the copy on
      // each invoice is frozen; a later line edit never rewrites a past invoice).
      const { data: lineData, error: lineErr } = await supabase
        .from("service_contract_lines")
        .select("*")
        .eq("contract_id", c.id)
        .order("sort_order", { ascending: true });
      if (lineErr) throw new Error(`lines: ${lineErr.message}`);
      const lines = (lineData ?? []) as DbServiceContractLine[];

      for (const run of runs) {
        const outcome = await billOneRun(supabase, c, run, lines, actorId);
        if (outcome === "generated") result.generated++;
        else if (outcome === "issued") {
          result.generated++;
          result.issued++;
        } else if (outcome === "skipped") result.skipped++;
      }

      // Refresh the display cursor.
      const next = nextBillingDateAfter(
        c.start_date,
        c.cadence,
        c.custom_interval_days,
        c.billing_timing,
        asOf,
        c.end_date
      );
      await supabase
        .from("service_contracts")
        .update({ next_billing_date: next })
        .eq("id", c.id);
    } catch (e) {
      result.failed++;
      const msg = `contract ${c.id} (${c.name}): ${e instanceof Error ? e.message : String(e)}`;
      result.errors.push(msg);
      console.error(`[recur-1/generate] ${msg}`); // LOUD
    }
  }
  return result;
}

type RunOutcome = "generated" | "issued" | "skipped";

/** Bill a single (contract, period) run idempotently. */
async function billOneRun(
  supabase: Client,
  contract: DbServiceContract,
  run: BillingRun,
  lines: DbServiceContractLine[],
  actorId: string | null
): Promise<RunOutcome> {
  // 1. Look up any existing claim for this period.
  const { data: existing } = await supabase
    .from("service_contract_invoices")
    .select("id, invoice_id")
    .eq("contract_id", contract.id)
    .eq("period_start", run.periodStart)
    .maybeSingle();

  let claimId: string;
  if (existing) {
    if ((existing as { invoice_id: string | null }).invoice_id) return "skipped"; // done
    claimId = (existing as { id: string }).id; // retry a claim whose invoice failed
  } else {
    // Claim the period. ON CONFLICT DO NOTHING is the DB backstop against a
    // concurrent double-fire; if the concurrent run won, we skip.
    const { data: claimed, error: claimErr } = await supabase
      .from("service_contract_invoices")
      .insert({
        contract_id: contract.id,
        period_start: run.periodStart,
        period_end: run.periodEnd,
      })
      .select("id")
      .maybeSingle();
    if (claimErr) {
      // Unique violation → another run claimed it; treat as skipped.
      if ((claimErr as { code?: string }).code === "23505") return "skipped";
      throw new Error(`claim: ${claimErr.message}`);
    }
    if (!claimed) return "skipped";
    claimId = (claimed as { id: string }).id;
  }

  // 2. Build the draft invoice (project-less; opco/client/site from the contract).
  const {
    data: { user },
  } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
  const createdBy = actorId ?? user?.id ?? null;

  const money = invoiceMoney(
    lines.map((l) => Number(l.amount)),
    Number(contract.tax_rate),
    contract.tax_exempt
  );

  // Automatic mode mints the number + issues now; the other modes leave a draft.
  const issueNow = contract.billing_mode === "automatic";
  let invoiceNumber: string | null = null;
  if (issueNow) {
    const { data: seq, error: seqErr } = await supabase.rpc("next_invoice_seq", {
      p_opco: contract.opco,
    });
    if (seqErr) throw new Error(`seq: ${seqErr.message}`);
    invoiceNumber = formatInvoiceNumber(contract.opco, Number(seq));
  }

  const { data: invRow, error: invErr } = await supabase
    .from("invoices")
    .insert({
      invoice_number: invoiceNumber,
      opco: contract.opco,
      project_id: null,
      client_id: contract.client_id,
      site_id: contract.site_id,
      status: issueNow ? "sent" : "draft",
      issue_date: issueNow ? businessDateISO() : null,
      tax_rate: contract.tax_rate,
      tax_exempt: contract.tax_exempt,
      holdback_rate: 0,
      holdback_hst_treatment: "charged_upfront", // no holdback on a monitoring contract
      subtotal: money.subtotal,
      tax_amount: money.tax,
      holdback_amount: 0,
      total: money.total,
      amount_due: money.amount_due,
      notes: `Service contract: ${contract.name} — ${run.periodStart} → ${run.periodEnd}`,
      created_by: createdBy,
      updated_by: createdBy,
    })
    .select("id")
    .single();
  if (invErr) throw new Error(`invoice: ${invErr.message}`);
  const invoiceId = (invRow as { id: string }).id;

  // 3. Snapshot the contract lines onto the invoice.
  if (lines.length > 0) {
    const invLines = lines.map((l, i) => ({
      invoice_id: invoiceId,
      description: l.description,
      quantity: 1,
      unit_price: round2(Number(l.amount)),
      amount: round2(Number(l.amount)),
      source_type: "manual",
      sort_order: i,
    }));
    const { error: lErr } = await supabase.from("invoice_lines").insert(invLines);
    if (lErr) throw new Error(`invoice_lines: ${lErr.message}`);
  }

  // 4. Link the invoice to the claimed period.
  const { error: linkErr } = await supabase
    .from("service_contract_invoices")
    .update({ invoice_id: invoiceId })
    .eq("id", claimId);
  if (linkErr) throw new Error(`link: ${linkErr.message}`);

  // 5. Audit (§5) — write directly with the passed client so it works under the
  //    admin client (logActivity's cookie path can't insert without a session).
  await supabase.from("activity_log").insert({
    entity_type: "service_contract",
    entity_id: contract.id,
    action: "update",
    changes: {
      invoice_generated: {
        from: null,
        to: `${run.periodStart} → ${run.periodEnd}${issueNow ? " (issued)" : " (draft)"} — $${money.total.toFixed(2)}`,
      },
    },
    actor_id: createdBy,
    parent_type: "client",
    parent_id: contract.client_id,
    entity_label: contract.name,
  });

  return issueNow ? "issued" : "generated";
}
