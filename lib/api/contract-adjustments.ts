import "server-only";

// RECUR-2 — the operator side of late fees (approve / waive a proposal) and
// mid-cycle cancellation credits (preview / apply). Cookie-aware server client;
// the action layer gates on financials:edit. Every money effect writes an
// activity row (§5) — on the contract, and on the invoice via the invoice API.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { businessDateISO, businessDatePlusDaysISO, formatCurrency } from "@/lib/format";
import { describeLateFeeTerms } from "@/lib/recurring/late-fees";
import {
  computeCancellationCredits,
  sumCredits,
  type BilledPeriod,
  type PeriodCredit,
} from "@/lib/recurring/cancellation";
import {
  addManualLine,
  applyContractCreditToInvoice,
  createOneOffInvoice,
  issueInvoice,
} from "@/lib/api/invoices";
import { logActivity } from "@/lib/api/activity-log";
import type {
  DbServiceContract,
  DbServiceContractCredit,
  DbServiceContractLateFee,
} from "@/lib/types/database";

const round2 = (n: number): number => Math.round(n * 100) / 100;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function db() {
  return createSupabaseServerClient();
}

export class ContractAdjustmentError extends Error {}

async function loadContract(id: string): Promise<DbServiceContract> {
  const supabase = await db();
  const { data, error } = await supabase.from("service_contracts").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`loadContract: ${error.message}`);
  if (!data) throw new ContractAdjustmentError("Contract not found.");
  return data as DbServiceContract;
}

function audit(contract: DbServiceContract, changes: Record<string, { from: unknown; to: unknown }>) {
  return logActivity("service_contract", contract.id, "update", changes, {
    entityLabel: contract.name,
    parentType: "client",
    parentId: contract.client_id,
  });
}

// ─── Late fees ────────────────────────────────────────────────────────────────

export interface LateFeeRow extends DbServiceContractLateFee {
  source_invoice_number: string | null;
  fee_invoice_number: string | null;
  contract_name: string | null;
  client_name: string | null;
}

type LateFeeJoin = DbServiceContractLateFee & {
  source: { invoice_number: string | null } | null;
  fee: { invoice_number: string | null } | null;
  contract: { name: string; client: { name: string } | null } | null;
};

const LATE_FEE_SELECT =
  "*, source:invoices!service_contract_late_fees_source_invoice_id_fkey(invoice_number), fee:invoices!service_contract_late_fees_fee_invoice_id_fkey(invoice_number), contract:service_contracts(name, client:clients(name))";

function toLateFeeRow(r: LateFeeJoin): LateFeeRow {
  const { source, fee, contract, ...rest } = r;
  return {
    ...rest,
    source_invoice_number: source?.invoice_number ?? null,
    fee_invoice_number: fee?.invoice_number ?? null,
    contract_name: contract?.name ?? null,
    client_name: contract?.client?.name ?? null,
  };
}

export async function listLateFeesForContract(contractId: string): Promise<LateFeeRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("service_contract_late_fees")
    .select(LATE_FEE_SELECT)
    .eq("contract_id", contractId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listLateFeesForContract: ${error.message}`);
  return ((data ?? []) as unknown as LateFeeJoin[]).map(toLateFeeRow);
}

/** Every proposal still awaiting a decision, across contracts (the approval queue). */
export async function listProposedLateFees(): Promise<LateFeeRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("service_contract_late_fees")
    .select(LATE_FEE_SELECT)
    .eq("status", "proposed")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listProposedLateFees: ${error.message}`);
  return ((data ?? []) as unknown as LateFeeJoin[]).map(toLateFeeRow);
}

/**
 * Approve a proposed late fee: claim the row (proposed → approved, conditional so
 * two clicks can't both charge), raise the fee on its OWN invoice (never by editing
 * the overdue one — §2.2), and issue it. Rolls the claim back if the invoice fails.
 */
export async function approveLateFee(
  feeId: string,
  actorId: string
): Promise<{ fee: DbServiceContractLateFee; invoiceId: string }> {
  const supabase = await db();
  const { data: claimed, error: cErr } = await supabase
    .from("service_contract_late_fees")
    .update({ status: "approved", decided_by: actorId, decided_at: new Date().toISOString() })
    .eq("id", feeId)
    .eq("status", "proposed")
    .select(LATE_FEE_SELECT)
    .maybeSingle();
  if (cErr) throw new Error(`approveLateFee/claim: ${cErr.message}`);
  if (!claimed) throw new ContractAdjustmentError("This late fee has already been approved or waived.");
  const fee = toLateFeeRow(claimed as unknown as LateFeeJoin);
  const contract = await loadContract(fee.contract_id);

  let invoiceId: string;
  try {
    const terms = describeLateFeeTerms({
      mode: (fee.mode as "percent_monthly" | "flat") ?? "flat",
      monthlyPct: fee.rate_pct,
      flatAmount: fee.amount,
      graceDays: contract.late_fee_grace_days ?? 0,
    });
    const draft = await createOneOffInvoice({
      opco: contract.opco,
      clientId: contract.client_id,
      siteId: contract.site_id,
      taxRatePct: Number(contract.tax_rate),
      // Late-payment interest/charges are treated as HST-exempt here — FLAGGED for
      // Jay's accountant to confirm (see the PR).
      taxExempt: true,
      dueDate:
        contract.payment_terms_days != null
          ? businessDatePlusDaysISO(Number(contract.payment_terms_days))
          : null,
      notes: `Late-payment charge under service contract “${contract.name}”. ${terms}`,
      lines: [
        {
          description: `Late-payment charge — invoice ${fee.source_invoice_number ?? "(unnumbered)"}, ${fee.days_overdue} days overdue on a balance of ${formatCurrency(Number(fee.basis_balance))}`,
          amount: Number(fee.amount),
        },
      ],
    });
    const issued = await issueInvoice(draft.id);
    invoiceId = issued.id;
  } catch (e) {
    await supabase
      .from("service_contract_late_fees")
      .update({ status: "proposed", decided_by: null, decided_at: null })
      .eq("id", feeId);
    throw e;
  }

  const { data: done, error: uErr } = await supabase
    .from("service_contract_late_fees")
    .update({ fee_invoice_id: invoiceId })
    .eq("id", feeId)
    .select("*")
    .single();
  if (uErr) throw new Error(`approveLateFee/link: ${uErr.message}`);

  await audit(contract, {
    late_fee_approved: {
      from: "proposed",
      to: `${formatCurrency(Number(fee.amount))} on ${fee.source_invoice_number ?? "invoice"} — charged`,
    },
  });
  return { fee: done as DbServiceContractLateFee, invoiceId };
}

export async function waiveLateFee(
  feeId: string,
  reason: string,
  actorId: string
): Promise<DbServiceContractLateFee> {
  const why = reason?.trim();
  if (!why) throw new ContractAdjustmentError("Say why the late fee is being waived.");
  const supabase = await db();
  const { data, error } = await supabase
    .from("service_contract_late_fees")
    .update({ status: "waived", waive_reason: why, decided_by: actorId, decided_at: new Date().toISOString() })
    .eq("id", feeId)
    .eq("status", "proposed")
    .select(LATE_FEE_SELECT)
    .maybeSingle();
  if (error) throw new Error(`waiveLateFee: ${error.message}`);
  if (!data) throw new ContractAdjustmentError("This late fee has already been approved or waived.");
  const fee = toLateFeeRow(data as unknown as LateFeeJoin);
  const contract = await loadContract(fee.contract_id);
  await audit(contract, {
    late_fee_waived: {
      from: "proposed",
      to: `${formatCurrency(Number(fee.amount))} on ${fee.source_invoice_number ?? "invoice"} — waived: ${why}`,
    },
  });
  return fee;
}

// ─── Cancellation credits ─────────────────────────────────────────────────────

export interface CancellationPreview {
  contractId: string;
  effectiveDate: string;
  billingTiming: string;
  credits: PeriodCredit[];
  totals: { total: number; applied: number; refundDue: number };
  /** Plain-language notes the dialog must show (§2.8). */
  notes: string[];
}

async function billedPeriods(contractId: string): Promise<BilledPeriod[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("service_contract_invoices")
    .select(
      "period_start, period_end, invoice:invoices(id, invoice_number, status, subtotal, tax_rate, tax_exempt, amount_due)"
    )
    .eq("contract_id", contractId);
  if (error) throw new Error(`billedPeriods: ${error.message}`);
  type Row = {
    period_start: string;
    period_end: string;
    invoice: {
      id: string;
      invoice_number: string | null;
      status: string;
      subtotal: number;
      tax_rate: number;
      tax_exempt: boolean;
      amount_due: number;
    } | null;
  };
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.invoice);
  const ids = rows.map((r) => r.invoice!.id);
  const paid = new Map<string, number>();
  if (ids.length > 0) {
    const { data: pays, error: pErr } = await supabase
      .from("invoice_payments")
      .select("invoice_id, amount")
      .in("invoice_id", ids);
    if (pErr) throw new Error(`billedPeriods/payments: ${pErr.message}`);
    for (const p of (pays ?? []) as { invoice_id: string; amount: number }[]) {
      paid.set(p.invoice_id, round2((paid.get(p.invoice_id) ?? 0) + Number(p.amount)));
    }
  }
  return rows.map((r) => ({
    periodStart: r.period_start,
    periodEnd: r.period_end,
    invoiceId: r.invoice!.id,
    invoiceNumber: r.invoice!.invoice_number,
    invoiceStatus: r.invoice!.status,
    subtotal: Number(r.invoice!.subtotal),
    taxRatePct: Number(r.invoice!.tax_rate),
    taxExempt: !!r.invoice!.tax_exempt,
    amountDue: Number(r.invoice!.amount_due),
    paid: paid.get(r.invoice!.id) ?? 0,
  }));
}

async function creditedPeriodStarts(contractId: string): Promise<Set<string>> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("service_contract_credits")
    .select("period_start")
    .eq("contract_id", contractId);
  if (error) throw new Error(`creditedPeriods: ${error.message}`);
  return new Set(((data ?? []) as { period_start: string }[]).map((r) => r.period_start));
}

function validateEffectiveDate(contract: DbServiceContract, effectiveDate: string): void {
  if (!ISO_DATE.test(effectiveDate ?? "")) throw new ContractAdjustmentError("Choose the last day of service.");
  if (effectiveDate < contract.start_date) {
    throw new ContractAdjustmentError("The last day of service can't be before the contract started.");
  }
  if (effectiveDate > businessDateISO()) {
    throw new ContractAdjustmentError(
      "Record the cancellation on or after the last day of service — it can't be in the future. To end a contract later, set its end date instead."
    );
  }
}

export async function previewCancellation(
  contractId: string,
  effectiveDate: string
): Promise<CancellationPreview> {
  const contract = await loadContract(contractId);
  validateEffectiveDate(contract, effectiveDate);
  const already = await creditedPeriodStarts(contractId);
  const periods = (await billedPeriods(contractId)).filter((p) => !already.has(p.periodStart));
  const credits = computeCancellationCredits(periods, effectiveDate);
  const notes: string[] = [];
  if (contract.billing_timing === "arrears") {
    notes.push(
      "This contract bills in arrears: the days used since its last invoice haven't been billed. No final invoice is created automatically — raise it by hand if one is owed."
    );
  }
  if (credits.some((c) => c.refundDue > 0)) {
    notes.push(
      "Part of the credit is for invoices already paid. It's recorded as a refund due to the client — the refund itself is paid outside Nexvelon (cheque or e-transfer)."
    );
  }
  if (credits.length === 0) notes.push("Nothing billed covers days after the last day of service, so no credit is due.");
  return {
    contractId,
    effectiveDate,
    billingTiming: contract.billing_timing,
    credits,
    totals: sumCredits(credits),
    notes,
  };
}

export interface CancellationResult {
  credits: DbServiceContractCredit[];
  totals: { total: number; applied: number; refundDue: number };
}

/**
 * Cancel a contract as of its last day of service and issue the pro-rated credits.
 * Stops billing first (status → cancelled, end_date → effective date), then applies
 * each credit. Retry-safe: a period already credited is skipped
 * (UNIQUE(contract_id, period_start) is the backstop).
 */
export async function cancelContractWithCredits(
  contractId: string,
  effectiveDate: string,
  actorId: string
): Promise<CancellationResult> {
  const contract = await loadContract(contractId);
  if (contract.status === "cancelled" && contract.cancelled_effective_date) {
    if (contract.cancelled_effective_date !== effectiveDate) {
      throw new ContractAdjustmentError(
        `This contract was already cancelled with service ending ${contract.cancelled_effective_date}.`
      );
    }
  }
  const preview = await previewCancellation(contractId, effectiveDate);
  const supabase = await db();

  const { error: sErr } = await supabase
    .from("service_contracts")
    .update({
      status: "cancelled",
      end_date: effectiveDate,
      cancelled_effective_date: effectiveDate,
      next_billing_date: null,
      updated_by: actorId,
    })
    .eq("id", contractId);
  if (sErr) throw new Error(`cancelContract/status: ${sErr.message}`);
  await audit(contract, {
    status: { from: contract.status, to: "cancelled" },
    last_day_of_service: { from: null, to: effectiveDate },
  });

  const created: DbServiceContractCredit[] = [];
  for (const c of preview.credits) {
    const { data: row, error } = await supabase
      .from("service_contract_credits")
      .insert({
        contract_id: contractId,
        source_invoice_id: c.invoiceId,
        period_start: c.periodStart,
        period_end: c.periodEnd,
        effective_date: effectiveDate,
        days_in_period: c.daysInPeriod,
        days_used: c.daysUsed,
        period_subtotal: c.periodSubtotal,
        earned_subtotal: c.earnedSubtotal,
        credit_subtotal: c.creditSubtotal,
        credit_tax: c.creditTax,
        credit_total: c.creditTotal,
        applied_amount: c.appliedAmount,
        refund_due: c.refundDue,
        disposition: c.disposition,
        created_by: actorId,
      })
      .select("*")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "23505") continue; // already credited
      throw new Error(`cancelContract/credit: ${error.message}`);
    }
    const credit = row as DbServiceContractCredit;
    const span = `${c.periodStart} → ${c.periodEnd}: ${c.daysInPeriod - c.daysUsed} unused of ${c.daysInPeriod} days`;

    if (c.disposition === "reduce_draft") {
      await addManualLine(c.invoiceId, {
        description: `Cancellation credit — ${span}`,
        quantity: 1,
        unit_price: -c.creditSubtotal,
      });
    } else if (c.appliedAmount > 0) {
      await applyContractCreditToInvoice({
        invoiceId: c.invoiceId,
        amount: c.appliedAmount,
        creditId: credit.id,
        appliedAt: businessDateISO(),
        note: `Cancellation credit (${span})`,
        actorId,
      });
    }
    created.push(credit);
    await audit(contract, {
      cancellation_credit: {
        from: null,
        to: `${formatCurrency(c.creditTotal)} on ${c.invoiceNumber ?? "draft invoice"} (${span})${
          c.refundDue > 0 ? ` — ${formatCurrency(c.refundDue)} refund due` : ""
        }`,
      },
    });
  }

  return { credits: created, totals: preview.totals };
}

export async function listCreditsForContract(contractId: string): Promise<DbServiceContractCredit[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("service_contract_credits")
    .select("*")
    .eq("contract_id", contractId)
    .order("period_start", { ascending: true });
  if (error) throw new Error(`listCreditsForContract: ${error.message}`);
  return (data ?? []) as DbServiceContractCredit[];
}
