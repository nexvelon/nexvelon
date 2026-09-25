import "server-only";

// RECUR-1 — service-contract data access (cookie-aware server client, RLS). CRUD +
// reads for the UI/actions. The recurring-invoice GENERATION engine is separate
// (lib/recurring/generate.ts) because it runs client-agnostic (cookie for a manual
// operator "generate now", service-role for the cron).
//
// Money note: a contract carries only REVENUE amounts (what the client pays) — no
// cost/margin — so there is nothing SEC-1 needs to redact here; amounts are visible
// to anyone who may view the contract (clients:view), and the generated invoice
// then follows the normal invoice gating.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/quote-helpers";
import {
  nextBillingDateAfter,
  monthlyEquivalent,
} from "@/lib/recurring/billing-schedule";
import { businessDatePlusDaysISO } from "@/lib/format";
import type {
  DbServiceContract,
  DbServiceContractLine,
  DbServiceContractInvoice,
  ServiceContractCadence,
  ServiceContractBillingTiming,
  ServiceContractBillingMode,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

/** A contract enriched for list/detail rendering. */
export interface ServiceContractRow extends DbServiceContract {
  client_name: string | null;
  site_name: string | null;
  /** Σ current line amounts — the per-period charge. */
  period_amount: number;
  /** Normalised monthly-equivalent for MRR. */
  monthly_equivalent: number;
}

type ContractJoin = DbServiceContract & {
  client: { name: string } | null;
  site: { name: string } | null;
};

async function amountByContract(
  supabase: Awaited<ReturnType<typeof db>>,
  contractIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (contractIds.length === 0) return out;
  const { data } = await supabase
    .from("service_contract_lines")
    .select("contract_id, amount")
    .in("contract_id", contractIds);
  for (const r of (data ?? []) as { contract_id: string; amount: number }[]) {
    out.set(r.contract_id, round2((out.get(r.contract_id) ?? 0) + Number(r.amount)));
  }
  return out;
}

function toRow(c: ContractJoin, periodAmount: number): ServiceContractRow {
  const { client, site, ...rest } = c;
  return {
    ...rest,
    client_name: client?.name ?? null,
    site_name: site?.name ?? null,
    period_amount: periodAmount,
    monthly_equivalent: monthlyEquivalent(periodAmount, c.cadence, c.custom_interval_days),
  };
}

/** All contracts, newest first, enriched with client/site names + amounts. */
export async function listServiceContracts(): Promise<ServiceContractRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("service_contracts")
    .select("*, client:clients(name), site:sites(name)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listServiceContracts: ${error.message}`);
  const rows = (data ?? []) as ContractJoin[];
  const amounts = await amountByContract(supabase, rows.map((r) => r.id));
  return rows.map((r) => toRow(r, amounts.get(r.id) ?? 0));
}

export async function listServiceContractsForClient(
  clientId: string
): Promise<ServiceContractRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("service_contracts")
    .select("*, client:clients(name), site:sites(name)")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listServiceContractsForClient: ${error.message}`);
  const rows = (data ?? []) as ContractJoin[];
  const amounts = await amountByContract(supabase, rows.map((r) => r.id));
  return rows.map((r) => toRow(r, amounts.get(r.id) ?? 0));
}

export async function listServiceContractsForSite(
  siteId: string
): Promise<ServiceContractRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("service_contracts")
    .select("*, client:clients(name), site:sites(name)")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listServiceContractsForSite: ${error.message}`);
  const rows = (data ?? []) as ContractJoin[];
  const amounts = await amountByContract(supabase, rows.map((r) => r.id));
  return rows.map((r) => toRow(r, amounts.get(r.id) ?? 0));
}

export interface ServiceContractDetail {
  contract: ServiceContractRow;
  lines: DbServiceContractLine[];
  invoices: (DbServiceContractInvoice & { invoice_number: string | null; invoice_status: string | null; invoice_total: number | null })[];
}

export async function getServiceContract(id: string): Promise<ServiceContractDetail | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("service_contracts")
    .select("*, client:clients(name), site:sites(name)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getServiceContract: ${error.message}`);
  if (!data) return null;
  const c = data as ContractJoin;

  const { data: lineData } = await supabase
    .from("service_contract_lines")
    .select("*")
    .eq("contract_id", id)
    .order("sort_order", { ascending: true });
  const lines = (lineData ?? []) as DbServiceContractLine[];
  const periodAmount = round2(lines.reduce((s, l) => s + Number(l.amount), 0));

  const { data: linkData } = await supabase
    .from("service_contract_invoices")
    .select("*, invoice:invoices(invoice_number, status, total)")
    .eq("contract_id", id)
    .order("period_start", { ascending: false });
  const invoices = ((linkData ?? []) as (DbServiceContractInvoice & {
    invoice: { invoice_number: string | null; status: string | null; total: number | null } | null;
  })[]).map((r) => ({
    id: r.id,
    contract_id: r.contract_id,
    invoice_id: r.invoice_id,
    period_start: r.period_start,
    period_end: r.period_end,
    generated_at: r.generated_at,
    invoice_number: r.invoice?.invoice_number ?? null,
    invoice_status: r.invoice?.status ?? null,
    invoice_total: r.invoice?.total ?? null,
  }));

  return { contract: toRow(c, periodAmount), lines, invoices };
}

/** Draft invoices generated from contracts and not yet issued — the "pending
 *  approval" queue (draft_for_approval mode). Surfaced prominently in the UI so an
 *  unissued draft is never forgotten (= lost revenue). */
export interface PendingContractDraft {
  invoice_id: string;
  invoice_status: string;
  total: number;
  contract_id: string;
  contract_name: string;
  client_name: string | null;
  opco: string;
  period_start: string;
  period_end: string;
}

export async function listPendingContractDrafts(): Promise<PendingContractDraft[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("service_contract_invoices")
    .select(
      "period_start, period_end, contract:service_contracts(id, name, opco, client:clients(name)), invoice:invoices(id, status, total)"
    )
    .not("invoice_id", "is", null)
    .order("period_start", { ascending: true });
  if (error) throw new Error(`listPendingContractDrafts: ${error.message}`);
  const out: PendingContractDraft[] = [];
  for (const r of (data ?? []) as unknown as {
    period_start: string;
    period_end: string;
    contract: { id: string; name: string; opco: string; client: { name: string } | null } | null;
    invoice: { id: string; status: string; total: number } | null;
  }[]) {
    if (!r.invoice || r.invoice.status !== "draft" || !r.contract) continue;
    out.push({
      invoice_id: r.invoice.id,
      invoice_status: r.invoice.status,
      total: Number(r.invoice.total ?? 0),
      contract_id: r.contract.id,
      contract_name: r.contract.name,
      client_name: r.contract.client?.name ?? null,
      opco: r.contract.opco,
      period_start: r.period_start,
      period_end: r.period_end,
    });
  }
  return out;
}

/** Honest MRR (§2.8): Σ monthly-equivalent over ACTIVE contracts, per opco + total.
 *  Draft/suspended/cancelled/expired contracts are excluded — only live recurring
 *  revenue counts. */
export interface RecurringRevenue {
  total: number;
  byOpco: { opco: string; mrr: number; activeCount: number }[];
  activeCount: number;
}

export async function getRecurringRevenue(): Promise<RecurringRevenue> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("service_contracts")
    .select("id, opco, cadence, custom_interval_days")
    .eq("status", "active");
  if (error) throw new Error(`getRecurringRevenue: ${error.message}`);
  const contracts = (data ?? []) as Pick<
    DbServiceContract,
    "id" | "opco" | "cadence" | "custom_interval_days"
  >[];
  const amounts = await amountByContract(supabase, contracts.map((c) => c.id));
  const byOpcoMap = new Map<string, { mrr: number; activeCount: number }>();
  let total = 0;
  for (const c of contracts) {
    const me = monthlyEquivalent(amounts.get(c.id) ?? 0, c.cadence, c.custom_interval_days);
    total = round2(total + me);
    const prev = byOpcoMap.get(c.opco) ?? { mrr: 0, activeCount: 0 };
    byOpcoMap.set(c.opco, { mrr: round2(prev.mrr + me), activeCount: prev.activeCount + 1 });
  }
  return {
    total,
    activeCount: contracts.length,
    byOpco: [...byOpcoMap.entries()]
      .map(([opco, v]) => ({ opco, mrr: v.mrr, activeCount: v.activeCount }))
      .sort((a, b) => b.mrr - a.mrr),
  };
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export interface ServiceContractInput {
  opco: string;
  clientId: string;
  siteId?: string | null;
  name: string;
  cadence: ServiceContractCadence;
  customIntervalDays?: number | null;
  billingTiming: ServiceContractBillingTiming;
  billingMode: ServiceContractBillingMode;
  startDate: string;
  endDate?: string | null;
  taxRate?: number;
  taxExempt?: boolean;
  notes?: string | null;
  lines: { description: string; amount: number }[];
}

/** Compute the display cursor for a contract's next billing date given its status. */
function computeNextBillingDate(c: {
  status: string;
  start_date: string;
  cadence: ServiceContractCadence;
  custom_interval_days: number | null;
  billing_timing: ServiceContractBillingTiming;
  end_date: string | null;
}): string | null {
  if (c.status !== "active") return null;
  // Display cursor: the first billing run on/after today = the next run strictly
  // after yesterday. Generation (the period-link table) remains the source of truth
  // for what has actually been billed.
  const yesterday = businessDatePlusDaysISO(-1);
  return nextBillingDateAfter(
    c.start_date,
    c.cadence,
    c.custom_interval_days,
    c.billing_timing,
    yesterday,
    c.end_date
  );
}

export async function createServiceContract(
  input: ServiceContractInput,
  actorId: string | null
): Promise<DbServiceContract> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("service_contracts")
    .insert({
      opco: input.opco,
      client_id: input.clientId,
      site_id: input.siteId ?? null,
      name: input.name,
      status: "draft",
      cadence: input.cadence,
      custom_interval_days: input.cadence === "custom" ? input.customIntervalDays ?? null : null,
      billing_timing: input.billingTiming,
      billing_mode: input.billingMode,
      start_date: input.startDate,
      end_date: input.endDate ?? null,
      next_billing_date: null,
      tax_rate: input.taxRate ?? 13,
      tax_exempt: input.taxExempt ?? false,
      notes: input.notes ?? null,
      created_by: actorId,
      updated_by: actorId,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createServiceContract: ${error.message}`);
  const contract = data as DbServiceContract;
  await replaceLines(supabase, contract.id, input.lines);
  return contract;
}

async function replaceLines(
  supabase: Awaited<ReturnType<typeof db>>,
  contractId: string,
  lines: { description: string; amount: number }[]
): Promise<void> {
  await supabase.from("service_contract_lines").delete().eq("contract_id", contractId);
  if (lines.length === 0) return;
  const rows = lines.map((l, i) => ({
    contract_id: contractId,
    description: l.description,
    amount: round2(l.amount),
    sort_order: i,
  }));
  const { error } = await supabase.from("service_contract_lines").insert(rows);
  if (error) throw new Error(`replaceLines: ${error.message}`);
}

export async function updateServiceContract(
  id: string,
  input: ServiceContractInput,
  actorId: string | null
): Promise<DbServiceContract> {
  const supabase = await db();
  const { data: cur } = await supabase
    .from("service_contracts")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  const status = (cur as { status: string } | null)?.status ?? "draft";
  const patch: Record<string, unknown> = {
    opco: input.opco,
    client_id: input.clientId,
    site_id: input.siteId ?? null,
    name: input.name,
    cadence: input.cadence,
    custom_interval_days: input.cadence === "custom" ? input.customIntervalDays ?? null : null,
    billing_timing: input.billingTiming,
    billing_mode: input.billingMode,
    start_date: input.startDate,
    end_date: input.endDate ?? null,
    tax_rate: input.taxRate ?? 13,
    tax_exempt: input.taxExempt ?? false,
    notes: input.notes ?? null,
    updated_by: actorId,
  };
  patch.next_billing_date = computeNextBillingDate({
    status,
    start_date: input.startDate,
    cadence: input.cadence,
    custom_interval_days: input.cadence === "custom" ? input.customIntervalDays ?? null : null,
    billing_timing: input.billingTiming,
    end_date: input.endDate ?? null,
  });
  const { data, error } = await supabase
    .from("service_contracts")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateServiceContract: ${error.message}`);
  await replaceLines(supabase, id, input.lines);
  return data as DbServiceContract;
}

/** Change lifecycle status; recompute the next-billing cursor for the new state. */
export async function setServiceContractStatus(
  id: string,
  status: string,
  actorId: string | null
): Promise<DbServiceContract> {
  const supabase = await db();
  const { data: cur, error: curErr } = await supabase
    .from("service_contracts")
    .select("start_date, cadence, custom_interval_days, billing_timing, end_date")
    .eq("id", id)
    .maybeSingle();
  if (curErr) throw new Error(`setServiceContractStatus/load: ${curErr.message}`);
  if (!cur) throw new Error("Contract not found.");
  const c = cur as Pick<
    DbServiceContract,
    "start_date" | "cadence" | "custom_interval_days" | "billing_timing" | "end_date"
  >;
  const next_billing_date = computeNextBillingDate({ ...c, status });
  const { data, error } = await supabase
    .from("service_contracts")
    .update({ status, next_billing_date, updated_by: actorId })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`setServiceContractStatus: ${error.message}`);
  return data as DbServiceContract;
}
