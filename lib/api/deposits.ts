import "server-only";

// FIN-4 — deposits & retainers. Cash collected up front on a project, held as
// an unapplied credit, then applied against that project's invoices until it
// is drawn down to zero.
//
// Two ledgers, nothing stored twice (§2.2):
//   project_deposits       — the money received
//   deposit_applications   — how much of a deposit went onto which invoice
// A deposit's remaining balance is amount − Σ its applications. A project's
// available credit is Σ deposits − Σ applications. Neither is a column.
//
// The FIN-2 hand-off: applying a deposit ALSO writes an invoice_payments row
// with method='deposit_applied' and a deposit_application_id back-link. FIN-2
// made that ledger the single source of truth for an invoice's balance and its
// derived status, so a settlement that skipped it would leave the invoice
// saying "sent / balance owing" while the client owes nothing. Writing through
// it means balance, status, aging bucket, statement and outstanding AR all stay
// correct with no changes to any of them.
//
// Un-applying deletes the application; the paired settlement row disappears via
// ON DELETE CASCADE (migration 0091), so the two can never drift apart.
//
// Cash honesty: a 'deposit_applied' row is NOT cash — the cash arrived earlier
// as the deposit. lib/api/financials.ts excludes it from cash-collected and
// counts project_deposits instead. See getCashCollected there.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/quote-helpers";
import { businessDateISO } from "@/lib/format";
import { deriveStatusFromPayments, isOpenStatus } from "@/lib/invoice-status";
import { logActivity } from "@/lib/api/activity-log";
import type {
  DbCashPaymentMethod,
  DbInvoice,
  DbProjectDeposit,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

export type DepositErrorCode =
  | "not_found"
  | "invalid_amount"
  | "invalid_status"
  | "project_mismatch"
  | "exceeds_deposit"
  | "exceeds_balance"
  | "has_applications";

export class DepositError extends Error {
  code: DepositErrorCode;
  constructor(code: DepositErrorCode, message: string) {
    super(message);
    this.name = "DepositError";
    this.code = code;
  }
}

/** A deposit plus its derived remaining (unapplied) balance. */
export interface DepositWithRemaining extends DbProjectDeposit {
  applied: number;
  remaining: number;
}

export interface ProjectDepositBalance {
  collected: number;
  applied: number;
  available: number;
}

// ─── Reads ───────────────────────────────────────────────────────────────────

/** Σ applications per deposit id. */
async function sumApplicationsByDeposit(
  supabase: Awaited<ReturnType<typeof db>>,
  depositIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (depositIds.length === 0) return out;
  const { data, error } = await supabase
    .from("deposit_applications")
    .select("deposit_id, amount")
    .in("deposit_id", depositIds);
  if (error) throw new Error(`sumApplicationsByDeposit: ${error.message}`);
  for (const a of (data ?? []) as { deposit_id: string; amount: number | null }[]) {
    out.set(
      a.deposit_id,
      round2((out.get(a.deposit_id) ?? 0) + Number(a.amount ?? 0))
    );
  }
  return out;
}

export async function listDepositsForProject(
  projectId: string
): Promise<DepositWithRemaining[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("project_deposits")
    .select("*")
    .eq("project_id", projectId)
    .order("received_at", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listDepositsForProject: ${error.message}`);

  const deposits = (data ?? []) as DbProjectDeposit[];
  const appliedByDeposit = await sumApplicationsByDeposit(
    supabase,
    deposits.map((d) => d.id)
  );

  return deposits.map((d) => {
    const applied = appliedByDeposit.get(d.id) ?? 0;
    return {
      ...d,
      applied: round2(applied),
      remaining: round2(Number(d.amount) - applied),
    };
  });
}

export async function getProjectDepositBalance(
  projectId: string
): Promise<ProjectDepositBalance> {
  const deposits = await listDepositsForProject(projectId);
  let collected = 0;
  let applied = 0;
  for (const d of deposits) {
    collected = round2(collected + Number(d.amount));
    applied = round2(applied + d.applied);
  }
  return { collected, applied, available: round2(collected - applied) };
}

/** Deposit credit sitting on one invoice (Σ applications against it). */
export async function getInvoiceDepositCredit(
  invoiceId: string
): Promise<number> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("deposit_applications")
    .select("amount")
    .eq("invoice_id", invoiceId);
  if (error) throw new Error(`getInvoiceDepositCredit: ${error.message}`);
  let total = 0;
  for (const a of (data ?? []) as { amount: number | null }[]) {
    total = round2(total + Number(a.amount ?? 0));
  }
  return total;
}

/**
 * Company-wide unapplied deposit money — the "Deposits held" KPI. This is cash
 * received that has not yet been applied against any invoice.
 */
export async function getDepositsHeldTotal(): Promise<number> {
  const supabase = await db();
  const [{ data: dep, error: dErr }, { data: app, error: aErr }] =
    await Promise.all([
      supabase.from("project_deposits").select("amount"),
      supabase.from("deposit_applications").select("amount"),
    ]);
  if (dErr) throw new Error(`getDepositsHeldTotal/deposits: ${dErr.message}`);
  if (aErr) throw new Error(`getDepositsHeldTotal/applications: ${aErr.message}`);

  let collected = 0;
  for (const d of (dep ?? []) as { amount: number | null }[]) {
    collected = round2(collected + Number(d.amount ?? 0));
  }
  let applied = 0;
  for (const a of (app ?? []) as { amount: number | null }[]) {
    applied = round2(applied + Number(a.amount ?? 0));
  }
  return round2(collected - applied);
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export interface RecordDepositInput {
  projectId: string;
  amount: number;
  method: DbCashPaymentMethod;
  receivedAt: string; // yyyy-mm-dd
  reference?: string | null;
  notes?: string | null;
  actorId?: string | null;
}

export async function recordDeposit(
  input: RecordDepositInput
): Promise<DbProjectDeposit> {
  const supabase = await db();

  const amount = round2(input.amount);
  if (!(amount > 0)) {
    throw new DepositError(
      "invalid_amount",
      "Deposit amount must be greater than zero."
    );
  }

  const { data: proj, error: pErr } = await supabase
    .from("projects")
    .select("id")
    .eq("id", input.projectId)
    .maybeSingle();
  if (pErr) throw new Error(`recordDeposit/project: ${pErr.message}`);
  if (!proj) throw new DepositError("not_found", "Project not found.");

  const { data, error } = await supabase
    .from("project_deposits")
    .insert({
      project_id: input.projectId,
      amount,
      method: input.method,
      received_at: input.receivedAt,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      created_by: input.actorId ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`recordDeposit: ${error.message}`);

  await logActivity("project", input.projectId, "update", {
    deposit_received: { from: null, to: amount },
  });

  return data as DbProjectDeposit;
}

/** Remove a deposit. Only allowed while nothing has been applied from it. */
export async function deleteDeposit(depositId: string): Promise<void> {
  const supabase = await db();

  const { data: dep, error: dErr } = await supabase
    .from("project_deposits")
    .select("id, project_id, amount")
    .eq("id", depositId)
    .maybeSingle();
  if (dErr) throw new Error(`deleteDeposit/load: ${dErr.message}`);
  if (!dep) throw new DepositError("not_found", "Deposit not found.");
  const deposit = dep as { id: string; project_id: string; amount: number };

  const applied = (await sumApplicationsByDeposit(supabase, [depositId])).get(
    depositId
  );
  if (applied && applied > 0) {
    throw new DepositError(
      "has_applications",
      "Un-apply this deposit from its invoices before deleting it."
    );
  }

  const { error } = await supabase
    .from("project_deposits")
    .delete()
    .eq("id", depositId);
  if (error) throw new Error(`deleteDeposit: ${error.message}`);

  await logActivity("project", deposit.project_id, "update", {
    deposit_removed: { from: Number(deposit.amount), to: null },
  });
}

export interface ApplyDepositInput {
  depositId: string;
  invoiceId: string;
  amount: number;
  actorId?: string | null;
}

export interface ApplyDepositResult {
  applicationId: string;
  invoice: DbInvoice;
}

/**
 * Apply part (or all) of a held deposit to one of its project's invoices.
 * Writes the application AND the paired non-cash settlement into the FIN-2
 * payment ledger, then re-derives the invoice status from that ledger.
 */
export async function applyDepositToInvoice(
  input: ApplyDepositInput
): Promise<ApplyDepositResult> {
  const supabase = await db();
  const amount = round2(input.amount);
  if (!(amount > 0)) {
    throw new DepositError(
      "invalid_amount",
      "Application amount must be greater than zero."
    );
  }

  // Deposit + its remaining.
  const { data: dep, error: dErr } = await supabase
    .from("project_deposits")
    .select("id, project_id, amount")
    .eq("id", input.depositId)
    .maybeSingle();
  if (dErr) throw new Error(`applyDeposit/deposit: ${dErr.message}`);
  if (!dep) throw new DepositError("not_found", "Deposit not found.");
  const deposit = dep as { id: string; project_id: string; amount: number };

  const appliedSoFar =
    (await sumApplicationsByDeposit(supabase, [input.depositId])).get(
      input.depositId
    ) ?? 0;
  const remaining = round2(Number(deposit.amount) - appliedSoFar);
  if (amount > remaining + 0.005) {
    throw new DepositError(
      "exceeds_deposit",
      `Only ${remaining.toFixed(2)} of this deposit is unapplied.`
    );
  }

  // Invoice + its balance.
  const { data: inv, error: iErr } = await supabase
    .from("invoices")
    .select("id, project_id, status, amount_due")
    .eq("id", input.invoiceId)
    .maybeSingle();
  if (iErr) throw new Error(`applyDeposit/invoice: ${iErr.message}`);
  if (!inv) throw new DepositError("not_found", "Invoice not found.");
  const invoice = inv as {
    id: string;
    project_id: string | null;
    status: string;
    amount_due: number;
  };

  if (invoice.project_id !== deposit.project_id) {
    throw new DepositError(
      "project_mismatch",
      "That invoice belongs to a different project than this deposit."
    );
  }
  if (!isOpenStatus(invoice.status)) {
    throw new DepositError(
      "invalid_status",
      "Only a sent or partially-paid invoice can take a deposit."
    );
  }

  const { data: payData, error: payErr } = await supabase
    .from("invoice_payments")
    .select("amount")
    .eq("invoice_id", input.invoiceId);
  if (payErr) throw new Error(`applyDeposit/payments: ${payErr.message}`);
  let settledSoFar = 0;
  for (const p of (payData ?? []) as { amount: number | null }[]) {
    settledSoFar = round2(settledSoFar + Number(p.amount ?? 0));
  }
  const amountDue = round2(Number(invoice.amount_due));
  const balance = round2(amountDue - settledSoFar);
  if (amount > balance + 0.005) {
    throw new DepositError(
      "exceeds_balance",
      `That invoice only has ${balance.toFixed(2)} outstanding.`
    );
  }

  const appliedAt = businessDateISO();

  const { data: appRow, error: appErr } = await supabase
    .from("deposit_applications")
    .insert({
      deposit_id: input.depositId,
      invoice_id: input.invoiceId,
      amount,
      applied_at: appliedAt,
      created_by: input.actorId ?? null,
    })
    .select("id")
    .single();
  if (appErr) throw new Error(`applyDeposit/application: ${appErr.message}`);
  const applicationId = (appRow as { id: string }).id;

  // The paired NON-CASH settlement, so FIN-2's balance + status math is the
  // only place that decides what an invoice owes.
  const { error: setErr } = await supabase.from("invoice_payments").insert({
    invoice_id: input.invoiceId,
    amount,
    method: "deposit_applied",
    paid_at: appliedAt,
    reference: null,
    notes: null,
    created_by: input.actorId ?? null,
    deposit_application_id: applicationId,
  });
  if (setErr) throw new Error(`applyDeposit/settlement: ${setErr.message}`);

  const status = deriveStatusFromPayments(amountDue, round2(settledSoFar + amount));
  const { data: updated, error: upErr } = await supabase
    .from("invoices")
    .update({ status })
    .eq("id", input.invoiceId)
    .select("*")
    .single();
  if (upErr) throw new Error(`applyDeposit/status: ${upErr.message}`);

  await logActivity("project", deposit.project_id, "update", {
    deposit_applied: { from: null, to: amount },
  });

  return { applicationId, invoice: updated as DbInvoice };
}

/**
 * Reverse an application: the row is deleted and its paired settlement goes
 * with it via ON DELETE CASCADE (0091), then the invoice status is re-derived
 * from whatever settlement remains.
 */
export async function unapplyDeposit(
  applicationId: string
): Promise<DbInvoice> {
  const supabase = await db();

  const { data: app, error: aErr } = await supabase
    .from("deposit_applications")
    .select("id, deposit_id, invoice_id, amount")
    .eq("id", applicationId)
    .maybeSingle();
  if (aErr) throw new Error(`unapplyDeposit/load: ${aErr.message}`);
  if (!app) throw new DepositError("not_found", "Deposit application not found.");
  const application = app as {
    id: string;
    deposit_id: string;
    invoice_id: string;
    amount: number;
  };

  const { data: inv, error: iErr } = await supabase
    .from("invoices")
    .select("id, project_id, status, amount_due")
    .eq("id", application.invoice_id)
    .maybeSingle();
  if (iErr) throw new Error(`unapplyDeposit/invoice: ${iErr.message}`);
  if (!inv) throw new DepositError("not_found", "Invoice not found.");
  const invoice = inv as {
    project_id: string | null;
    status: string;
    amount_due: number;
  };
  if (invoice.status === "void") {
    throw new DepositError(
      "invalid_status",
      "Can't change deposit applications on a void invoice."
    );
  }

  // The paired invoice_payments row cascades away with this delete.
  const { error: delErr } = await supabase
    .from("deposit_applications")
    .delete()
    .eq("id", applicationId);
  if (delErr) throw new Error(`unapplyDeposit/delete: ${delErr.message}`);

  const { data: payData, error: payErr } = await supabase
    .from("invoice_payments")
    .select("amount")
    .eq("invoice_id", application.invoice_id);
  if (payErr) throw new Error(`unapplyDeposit/payments: ${payErr.message}`);
  let settled = 0;
  for (const p of (payData ?? []) as { amount: number | null }[]) {
    settled = round2(settled + Number(p.amount ?? 0));
  }

  const status = deriveStatusFromPayments(
    round2(Number(invoice.amount_due)),
    settled
  );
  const { data: updated, error: upErr } = await supabase
    .from("invoices")
    .update({ status })
    .eq("id", application.invoice_id)
    .select("*")
    .single();
  if (upErr) throw new Error(`unapplyDeposit/status: ${upErr.message}`);

  if (invoice.project_id) {
    await logActivity("project", invoice.project_id, "update", {
      deposit_unapplied: { from: Number(application.amount), to: null },
    });
  }

  return updated as DbInvoice;
}
