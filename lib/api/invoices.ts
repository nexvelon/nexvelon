import "server-only";

// INVOICE-1 — server-only invoicing API (public.invoices + invoice_lines +
// the per-entity invoice_counters/next_invoice_seq, migration 0043).
// Cookie-aware server client (RLS); created_by/updated_by from the auth uid.
//
// Money model (recomputeTotals):
//   subtotal        = Σ line.amount
//   tax_amount      = tax_exempt ? 0 : subtotal * tax_rate/100
//   holdback_amount = subtotal * holdback_rate/100
//   total           = subtotal + tax_amount
//   amount_due      = total - holdback_amount
// NOTE: HST is charged on the FULL subtotal even when a holdback is retained —
// the holdback is a payment-TIMING reduction (released on substantial
// completion), not a tax reduction. TODO(accounting): confirm holdback HST
// timing with the accountant before INVOICE-1b (branded PDF).

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { formatInvoiceNumber, businessDateISO } from "@/lib/format";
import { round2 } from "@/lib/quote-helpers";
import type { DbInvoice, DbInvoiceLine } from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

/** A cost center the invoice's project exposes for a draw. */
export interface InvoiceCostCenterOption {
  id: string;
  cc_number: string;
  name: string;
  contract_value: number;
}

/** A list row: the invoice + client / project display fields. */
export interface InvoiceListRow extends DbInvoice {
  client_name: string | null;
  project_number: string | null;
}

/** A named address block — the Bill-To client or the service-location site. */
export interface InvoiceParty {
  name: string | null;
  legal_name: string | null;
  street: string | null;
  unit: string | null;
  city: string | null;
  province: string | null;
  postal: string | null;
  country: string | null;
}

export interface InvoiceDetail {
  invoice: DbInvoice;
  lines: DbInvoiceLine[];
  client_name: string | null;
  site_name: string | null;
  project_number: string | null;
  project_title: string | null;
  /** Bill-To: client + billing address (for the PDF letterhead). */
  billTo: InvoiceParty | null;
  /** Service location: site + address, when the invoice has a site. */
  serviceLocation: InvoiceParty | null;
  /** The project's cost centers, available to pull as lines. */
  costCenters: InvoiceCostCenterOption[];
}

/** Returned by every line/setting mutation: fresh header totals + lines. */
export interface InvoiceMutationResult {
  invoice: DbInvoice;
  lines: DbInvoiceLine[];
}

// Supabase nests FK selects; split them back out.
type InvoiceJoinRow = DbInvoice & {
  client: { name: string } | null;
  project: { project_number: string } | null;
};

async function fetchLines(
  supabase: Awaited<ReturnType<typeof db>>,
  invoiceId: string
): Promise<DbInvoiceLine[]> {
  const { data, error } = await supabase
    .from("invoice_lines")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`invoice lines: ${error.message}`);
  return (data ?? []) as DbInvoiceLine[];
}

// ─── Reads ─────────────────────────────────────────────────────────────────

export async function listInvoices(): Promise<InvoiceListRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("invoices")
    .select("*, client:clients(name), project:projects(project_number)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listInvoices: ${error.message}`);
  return ((data ?? []) as InvoiceJoinRow[]).map((r) => {
    const { client, project, ...inv } = r;
    return {
      ...(inv as DbInvoice),
      client_name: client?.name ?? null,
      project_number: project?.project_number ?? null,
    };
  });
}

// Shapes of the richer client/site joins used by getInvoiceById (for the PDF
// Bill-To + service-location address blocks).
type ClientPartyJoin = {
  name: string;
  legal_name: string | null;
  billing_street: string | null;
  billing_unit: string | null;
  billing_city: string | null;
  billing_province: string | null;
  billing_postal: string | null;
  billing_country: string | null;
};
type SitePartyJoin = {
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
};

export async function getInvoiceById(id: string): Promise<InvoiceDetail | null> {
  const supabase = await db();
  const { data: inv, error } = await supabase
    .from("invoices")
    .select(
      "*, " +
        "client:clients(name, legal_name, billing_street, billing_unit, billing_city, billing_province, billing_postal, billing_country), " +
        "site:sites(name, address_line1, address_line2, city, province, postal_code, country), " +
        "project:projects(project_number, title)"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getInvoiceById: ${error.message}`);
  if (!inv) return null;

  const row = inv as unknown as DbInvoice & {
    client: ClientPartyJoin | null;
    site: SitePartyJoin | null;
    project: { project_number: string; title: string | null } | null;
  };
  const { client, site, project, ...invoice } = row;

  // The project's cost centers are the menu of draws this invoice can pull.
  let costCenters: InvoiceCostCenterOption[] = [];
  if (invoice.project_id) {
    const { data: ccs, error: ccErr } = await supabase
      .from("project_cost_centers")
      .select("id, cc_number, name, contract_value")
      .eq("project_id", invoice.project_id)
      .order("sort_order", { ascending: true });
    if (ccErr) throw new Error(`getInvoiceById/costCenters: ${ccErr.message}`);
    costCenters = (ccs ?? []) as InvoiceCostCenterOption[];
  }

  const lines = await fetchLines(supabase, id);

  const billTo: InvoiceParty | null = client
    ? {
        name: client.name,
        legal_name: client.legal_name,
        street: client.billing_street,
        unit: client.billing_unit,
        city: client.billing_city,
        province: client.billing_province,
        postal: client.billing_postal,
        country: client.billing_country,
      }
    : null;

  const serviceLocation: InvoiceParty | null = site
    ? {
        name: site.name,
        legal_name: null,
        street: site.address_line1,
        unit: site.address_line2,
        city: site.city,
        province: site.province,
        postal: site.postal_code,
        country: site.country,
      }
    : null;

  return {
    invoice: invoice as DbInvoice,
    lines,
    client_name: client?.name ?? null,
    site_name: site?.name ?? null,
    project_number: project?.project_number ?? null,
    project_title: project?.title ?? null,
    billTo,
    serviceLocation,
    costCenters,
  };
}

export async function listInvoicesForProject(
  projectId: string
): Promise<InvoiceListRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("invoices")
    .select("*, client:clients(name), project:projects(project_number)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listInvoicesForProject: ${error.message}`);
  return ((data ?? []) as InvoiceJoinRow[]).map((r) => {
    const { client, project, ...inv } = r;
    return {
      ...(inv as DbInvoice),
      client_name: client?.name ?? null,
      project_number: project?.project_number ?? null,
    };
  });
}

// ─── Create ────────────────────────────────────────────────────────────────

/**
 * INVOICE-1 — open a DRAFT invoice for a project: inherit opco / client / site
 * from the project. NO number yet (minted on issue), tax_rate 13, holdback 0.
 */
export async function createInvoiceForProject(
  projectId: string
): Promise<DbInvoice> {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: proj, error: pErr } = await supabase
    .from("projects")
    .select("opco, client_id, site_id")
    .eq("id", projectId)
    .maybeSingle();
  if (pErr) throw new Error(`createInvoiceForProject/project: ${pErr.message}`);
  if (!proj) throw new Error("Project not found.");
  const p = proj as { opco: string; client_id: string; site_id: string | null };

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      opco: p.opco,
      project_id: projectId,
      client_id: p.client_id,
      site_id: p.site_id,
      status: "draft",
      // tax_rate (13), holdback_rate (0), currency ('CAD') come from defaults.
      created_by: user?.id ?? null,
      updated_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createInvoiceForProject: ${error.message}`);
  return data as DbInvoice;
}

// ─── Totals ──────────────────────────────────────────────────────────────────

/**
 * Recompute the header money columns from the current lines + tax/holdback
 * settings, persist them, and return the updated header. See the file header
 * for the formula (HST on full subtotal; holdback reduces amount_due only).
 */
export async function recomputeTotals(invoiceId: string): Promise<DbInvoice> {
  const supabase = await db();

  const { data: inv, error: iErr } = await supabase
    .from("invoices")
    .select("tax_rate, tax_exempt, holdback_rate")
    .eq("id", invoiceId)
    .single();
  if (iErr) throw new Error(`recomputeTotals/invoice: ${iErr.message}`);
  const h = inv as {
    tax_rate: number;
    tax_exempt: boolean;
    holdback_rate: number;
  };

  const lines = await fetchLines(supabase, invoiceId);
  const subtotal = round2(lines.reduce((s, l) => s + Number(l.amount), 0));
  const taxAmount = h.tax_exempt
    ? 0
    : round2((subtotal * Number(h.tax_rate)) / 100);
  const holdbackAmount = round2((subtotal * Number(h.holdback_rate)) / 100);
  const total = round2(subtotal + taxAmount);
  const amountDue = round2(total - holdbackAmount);

  const { data, error } = await supabase
    .from("invoices")
    .update({
      subtotal,
      tax_amount: taxAmount,
      holdback_amount: holdbackAmount,
      total,
      amount_due: amountDue,
    })
    .eq("id", invoiceId)
    .select("*")
    .single();
  if (error) throw new Error(`recomputeTotals: ${error.message}`);
  return data as DbInvoice;
}

async function settle(invoiceId: string): Promise<InvoiceMutationResult> {
  const supabase = await db();
  const invoice = await recomputeTotals(invoiceId);
  const lines = await fetchLines(supabase, invoiceId);
  return { invoice, lines };
}

async function nextSortOrder(
  supabase: Awaited<ReturnType<typeof db>>,
  invoiceId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("invoice_lines")
    .select("sort_order")
    .eq("invoice_id", invoiceId);
  if (error) throw new Error(`nextSortOrder: ${error.message}`);
  let max = -1;
  for (const r of (data ?? []) as { sort_order: number }[]) {
    max = Math.max(max, Number(r.sort_order));
  }
  return max + 1;
}

// ─── Line ops ────────────────────────────────────────────────────────────────

export interface ManualLineInput {
  description?: string;
  quantity?: number;
  unit_price?: number;
}

export async function addManualLine(
  invoiceId: string,
  input: ManualLineInput = {}
): Promise<InvoiceMutationResult> {
  const supabase = await db();
  const quantity = input.quantity ?? 1;
  const unitPrice = input.unit_price ?? 0;
  const sortOrder = await nextSortOrder(supabase, invoiceId);
  const { error } = await supabase.from("invoice_lines").insert({
    invoice_id: invoiceId,
    description: input.description ?? "",
    quantity,
    unit_price: unitPrice,
    amount: round2(quantity * unitPrice),
    source_type: "manual",
    sort_order: sortOrder,
  });
  if (error) throw new Error(`addManualLine: ${error.message}`);
  return settle(invoiceId);
}

/**
 * Pull a project cost center as a line: amount = contract_value * pct/100
 * (pct < 100 = a progress / deposit draw). The line stays a normal editable
 * line — only its source_* fields mark its origin.
 */
export async function addCostCenterLine(
  invoiceId: string,
  costCenterId: string,
  pct = 100
): Promise<InvoiceMutationResult> {
  const supabase = await db();

  const { data: cc, error: ccErr } = await supabase
    .from("project_cost_centers")
    .select("name, contract_value")
    .eq("id", costCenterId)
    .maybeSingle();
  if (ccErr) throw new Error(`addCostCenterLine/cc: ${ccErr.message}`);
  if (!cc) throw new Error("Cost center not found.");
  const center = cc as { name: string; contract_value: number };

  const amount = round2((Number(center.contract_value) * pct) / 100);
  const sortOrder = await nextSortOrder(supabase, invoiceId);
  const { error } = await supabase.from("invoice_lines").insert({
    invoice_id: invoiceId,
    description: center.name,
    quantity: 1,
    unit_price: amount,
    amount,
    source_type: "cost_center",
    source_id: costCenterId,
    source_pct: pct,
    sort_order: sortOrder,
  });
  if (error) throw new Error(`addCostCenterLine: ${error.message}`);
  return settle(invoiceId);
}

export interface LineUpdateInput {
  description?: string;
  quantity?: number;
  unit_price?: number;
  amount?: number;
}

/**
 * Edit a line. Editing qty or price re-derives amount = qty * price, UNLESS an
 * explicit `amount` is supplied — full flexibility, incl. overriding a sourced
 * (cost-center) line's amount. Source linkage is preserved by edits.
 */
export async function updateLine(
  invoiceId: string,
  lineId: string,
  patch: LineUpdateInput
): Promise<InvoiceMutationResult> {
  const supabase = await db();

  const { data: cur, error: curErr } = await supabase
    .from("invoice_lines")
    .select("quantity, unit_price, amount")
    .eq("id", lineId)
    .maybeSingle();
  if (curErr) throw new Error(`updateLine/load: ${curErr.message}`);
  if (!cur) throw new Error("Line not found.");
  const line = cur as { quantity: number; unit_price: number; amount: number };

  const quantity = patch.quantity ?? Number(line.quantity);
  const unitPrice = patch.unit_price ?? Number(line.unit_price);

  let amount: number;
  if (patch.amount !== undefined) {
    amount = round2(patch.amount); // explicit override wins (e.g. a sourced line)
  } else if (patch.quantity !== undefined || patch.unit_price !== undefined) {
    amount = round2(quantity * unitPrice); // re-derive from qty × price
  } else {
    amount = round2(Number(line.amount)); // desc-only edit keeps the amount
  }

  const update: Record<string, unknown> = { quantity, unit_price: unitPrice, amount };
  if (patch.description !== undefined) update.description = patch.description;

  const { error } = await supabase
    .from("invoice_lines")
    .update(update)
    .eq("id", lineId);
  if (error) throw new Error(`updateLine: ${error.message}`);
  return settle(invoiceId);
}

/** Detach a sourced line from its cost center, keeping its current amount. */
export async function unlinkLine(
  invoiceId: string,
  lineId: string
): Promise<InvoiceMutationResult> {
  const supabase = await db();
  const { error } = await supabase
    .from("invoice_lines")
    .update({ source_type: "manual", source_id: null, source_pct: null })
    .eq("id", lineId);
  if (error) throw new Error(`unlinkLine: ${error.message}`);
  return settle(invoiceId);
}

export async function deleteLine(
  invoiceId: string,
  lineId: string
): Promise<InvoiceMutationResult> {
  const supabase = await db();
  const { error } = await supabase
    .from("invoice_lines")
    .delete()
    .eq("id", lineId);
  if (error) throw new Error(`deleteLine: ${error.message}`);
  return settle(invoiceId);
}

// ─── Header settings (each recomputes) ───────────────────────────────────────

async function patchInvoice(
  invoiceId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const supabase = await db();
  const { error } = await supabase
    .from("invoices")
    .update(patch)
    .eq("id", invoiceId);
  if (error) throw new Error(`updateInvoice: ${error.message}`);
}

export async function setTaxRate(
  invoiceId: string,
  taxRate: number
): Promise<InvoiceMutationResult> {
  await patchInvoice(invoiceId, { tax_rate: taxRate });
  return settle(invoiceId);
}

export async function setTaxExempt(
  invoiceId: string,
  exempt: boolean
): Promise<InvoiceMutationResult> {
  await patchInvoice(invoiceId, { tax_exempt: exempt });
  return settle(invoiceId);
}

export async function setHoldbackRate(
  invoiceId: string,
  holdbackRate: number
): Promise<InvoiceMutationResult> {
  // 10 = the Ontario statutory holdback rate (Construction Act).
  await patchInvoice(invoiceId, { holdback_rate: holdbackRate });
  return settle(invoiceId);
}

export async function setDueDate(
  invoiceId: string,
  dueDate: string | null
): Promise<InvoiceMutationResult> {
  await patchInvoice(invoiceId, { due_date: dueDate });
  return settle(invoiceId);
}

export async function setNotes(
  invoiceId: string,
  notes: string
): Promise<InvoiceMutationResult> {
  await patchInvoice(invoiceId, { notes });
  return settle(invoiceId);
}

// ─── Issue + status ──────────────────────────────────────────────────────────

/**
 * Issue a draft: mint a gapless per-entity number (only if none yet, so deleted
 * drafts never burn a sequence), stamp issue_date = today, set status 'sent'.
 */
export async function issueInvoice(id: string): Promise<DbInvoice> {
  const supabase = await db();

  const { data: inv, error: iErr } = await supabase
    .from("invoices")
    .select("opco, invoice_number, status")
    .eq("id", id)
    .maybeSingle();
  if (iErr) throw new Error(`issueInvoice/load: ${iErr.message}`);
  if (!inv) throw new Error("Invoice not found.");
  const cur = inv as {
    opco: string;
    invoice_number: string | null;
    status: string;
  };

  let invoiceNumber = cur.invoice_number;
  if (!invoiceNumber) {
    const { data: seq, error: seqErr } = await supabase.rpc(
      "next_invoice_seq",
      { p_opco: cur.opco }
    );
    if (seqErr) throw new Error(`issueInvoice/seq: ${seqErr.message}`);
    invoiceNumber = formatInvoiceNumber(cur.opco, Number(seq));
  }

  const { data, error } = await supabase
    .from("invoices")
    .update({
      invoice_number: invoiceNumber,
      issue_date: businessDateISO(),
      status: "sent",
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`issueInvoice: ${error.message}`);
  return data as DbInvoice;
}

export async function setInvoiceStatus(
  id: string,
  status: "sent" | "paid" | "void"
): Promise<DbInvoice> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("invoices")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`setInvoiceStatus: ${error.message}`);
  return data as DbInvoice;
}
