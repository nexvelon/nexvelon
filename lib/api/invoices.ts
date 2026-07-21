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
import { isSerializedProduct } from "@/lib/inventory-serial";
import { composeIdentifier } from "@/lib/invoice-identifiers";
import { deriveStatusFromPayments, isOpenStatus } from "@/lib/invoice-status";
import type {
  DbInvoice,
  DbInvoiceLine,
  DbInvoicePayment,
  DbInvoicePaymentMethod,
} from "@/lib/types/database";

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
  // POLISH-44 — true when the bill-to client has been soft-deleted (archived).
  client_deleted: boolean;
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
  /** FIN-2 — the recorded payments (the ledger behind the derived balance). */
  payments: DbInvoicePayment[];
}

/** Returned by every line/setting mutation: fresh header totals + lines. */
export interface InvoiceMutationResult {
  invoice: DbInvoice;
  lines: DbInvoiceLine[];
}

// Supabase nests FK selects; split them back out.
type InvoiceJoinRow = DbInvoice & {
  client: { name: string; deleted_at: string | null } | null;
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
    .select("*, client:clients(name,deleted_at), project:projects(project_number)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listInvoices: ${error.message}`);
  return ((data ?? []) as InvoiceJoinRow[]).map((r) => {
    const { client, project, ...inv } = r;
    return {
      ...(inv as DbInvoice),
      client_name: client?.name ?? null,
      client_deleted: !!client?.deleted_at,
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
  const payments = await listPaymentsForInvoice(id);

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
    payments,
  };
}

export async function listInvoicesForProject(
  projectId: string
): Promise<InvoiceListRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("invoices")
    .select("*, client:clients(name,deleted_at), project:projects(project_number)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listInvoicesForProject: ${error.message}`);
  return ((data ?? []) as InvoiceJoinRow[]).map((r) => {
    const { client, project, ...inv } = r;
    return {
      ...(inv as DbInvoice),
      client_name: client?.name ?? null,
      client_deleted: !!client?.deleted_at,
      project_number: project?.project_number ?? null,
    };
  });
}

/**
 * PROJ2-4d — invoices attached to a single Job (invoices.job_id, migration
 * 0084). Powers the Job detail Financials tab. Mirrors listInvoicesForProject.
 */
export async function listInvoicesForJob(
  jobId: string
): Promise<InvoiceListRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("invoices")
    .select("*, client:clients(name,deleted_at), project:projects(project_number)")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listInvoicesForJob: ${error.message}`);
  return ((data ?? []) as InvoiceJoinRow[]).map((r) => {
    const { client, project, ...inv } = r;
    return {
      ...(inv as DbInvoice),
      client_name: client?.name ?? null,
      client_deleted: !!client?.deleted_at,
      project_number: project?.project_number ?? null,
    };
  });
}

/**
 * MATERIALS-1 — invoices that bill a given part (have a line with product_id).
 * Powers the part detail's Invoices section.
 */
export async function listInvoicesForProduct(
  productId: string
): Promise<InvoiceListRow[]> {
  const supabase = await db();
  const { data: lineRows, error: lErr } = await supabase
    .from("invoice_lines")
    .select("invoice_id")
    .eq("product_id", productId);
  if (lErr) throw new Error(`listInvoicesForProduct/lines: ${lErr.message}`);
  const ids = [
    ...new Set(((lineRows ?? []) as { invoice_id: string }[]).map((r) => r.invoice_id)),
  ];
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("invoices")
    .select("*, client:clients(name,deleted_at), project:projects(project_number)")
    .in("id", ids)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listInvoicesForProduct: ${error.message}`);
  return ((data ?? []) as InvoiceJoinRow[]).map((r) => {
    const { client, project, ...inv } = r;
    return {
      ...(inv as DbInvoice),
      client_name: client?.name ?? null,
      client_deleted: !!client?.deleted_at,
      project_number: project?.project_number ?? null,
    };
  });
}

// ─── Billable materials ──────────────────────────────────────────────────────

/** A group of a project's billable stock (one part × one cost-center). */
export interface BillableMaterialGroup {
  product_id: string;
  master_part_number: string | null;
  part_number: string | null; // sku
  name: string;
  description: string | null;
  is_serialized: boolean;
  cost_center_id: string;
  cost_center_label: string;
  qty: number; // total currently on this cost-center
  billed_qty: number; // already billed (material lines on this project's invoices)
  remaining_qty: number; // qty - billed_qty (>= 0)
  unit_cost: number; // AVERAGE of the group's stock rows' unit_cost
  suggested_unit_price: number; // the part's Sell Price (list_price)
  // The stock rows in this group, each with its serial (serialized only) — so a
  // serialized unit bills as its own line with its serial + source_stock_id.
  units: { stock_id: string; quantity: number; serial: string | null }[];
}

type StockMaterialRow = {
  id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  serial_number: string | null;
  custody_status: string;
  current_cost_center_id: string;
};

/**
 * MATERIALS-1 — a project's billable parts, grouped by part × cost-center.
 * A unit BELONGS to the project when its current_cost_center_id is one of the
 * project's cost-centers (which holds through delivered / installed / consumed);
 * a 'lost' unit is excluded (it's gone). billed_qty is the quantity already
 * billed via material lines on ANY of this project's invoices, so fully-billed
 * groups can be greyed out (no silent double-billing).
 */
export async function listBillableMaterialsForProject(
  projectId: string
): Promise<BillableMaterialGroup[]> {
  const supabase = await db();

  // Project cost-centers (label menu + scope).
  const { data: ccData, error: ccErr } = await supabase
    .from("project_cost_centers")
    .select("id, cc_number, name")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });
  if (ccErr) throw new Error(`listBillableMaterials/cc: ${ccErr.message}`);
  const ccs = (ccData ?? []) as { id: string; cc_number: string; name: string }[];
  if (ccs.length === 0) return [];
  const ccLabel = new Map(ccs.map((c) => [c.id, c.name]));
  const ccIds = ccs.map((c) => c.id);

  // Stock currently on those cost-centers (exclude lost).
  const { data: stockData, error: sErr } = await supabase
    .from("inventory_stock")
    .select(
      "id, product_id, quantity, unit_cost, serial_number, custody_status, current_cost_center_id"
    )
    .in("current_cost_center_id", ccIds)
    .neq("custody_status", "lost");
  if (sErr) throw new Error(`listBillableMaterials/stock: ${sErr.message}`);
  const stock = (stockData ?? []) as StockMaterialRow[];
  if (stock.length === 0) return [];

  // Product identifiers for the groups present.
  const productIds = [...new Set(stock.map((s) => s.product_id))];
  const { data: prodData, error: pErr } = await supabase
    .from("inventory_products")
    .select(
      "id, master_part_number, sku, name, description, list_price, is_serialized, tracking_mode"
    )
    .in("id", productIds);
  if (pErr) throw new Error(`listBillableMaterials/products: ${pErr.message}`);
  const productById = new Map(
    ((prodData ?? []) as {
      id: string;
      master_part_number: string | null;
      sku: string | null;
      name: string | null;
      description: string | null;
      list_price: number | null;
      is_serialized: boolean;
      tracking_mode: string;
    }[]).map((p) => [p.id, p])
  );

  // Already-billed quantity per (product_id, cost_center_id) across THIS
  // project's invoices' material lines.
  const { data: invRows } = await supabase
    .from("invoices")
    .select("id")
    .eq("project_id", projectId);
  const invoiceIds = ((invRows ?? []) as { id: string }[]).map((r) => r.id);
  const billedByKey = new Map<string, number>();
  if (invoiceIds.length > 0) {
    const { data: matLines } = await supabase
      .from("invoice_lines")
      .select("product_id, source_id, quantity")
      .eq("source_type", "material")
      .in("invoice_id", invoiceIds);
    for (const l of (matLines ?? []) as {
      product_id: string | null;
      source_id: string | null;
      quantity: number;
    }[]) {
      if (!l.product_id || !l.source_id) continue;
      const key = `${l.product_id}::${l.source_id}`;
      billedByKey.set(key, (billedByKey.get(key) ?? 0) + Number(l.quantity));
    }
  }

  // Group stock by (product, cost-center).
  const groups = new Map<string, BillableMaterialGroup>();
  for (const s of stock) {
    const product = productById.get(s.product_id);
    if (!product) continue;
    const key = `${s.product_id}::${s.current_cost_center_id}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        product_id: s.product_id,
        master_part_number: product.master_part_number,
        part_number: product.sku,
        name: product.name ?? product.sku ?? "Material",
        description: product.description,
        is_serialized: isSerializedProduct(product),
        cost_center_id: s.current_cost_center_id,
        cost_center_label: ccLabel.get(s.current_cost_center_id) ?? "Cost center",
        qty: 0,
        billed_qty: billedByKey.get(key) ?? 0,
        remaining_qty: 0,
        unit_cost: 0,
        suggested_unit_price: Number(product.list_price ?? 0),
        units: [],
      };
      groups.set(key, g);
    }
    g.qty += Number(s.quantity);
    g.units.push({
      stock_id: s.id,
      quantity: Number(s.quantity),
      serial: s.serial_number,
    });
  }

  // Finalize: average unit cost + remaining.
  const out: BillableMaterialGroup[] = [];
  for (const g of groups.values()) {
    const costs = g.units; // one entry per stock row
    const avg =
      costs.length > 0
        ? round2(
            stock
              .filter(
                (s) =>
                  s.product_id === g.product_id &&
                  s.current_cost_center_id === g.cost_center_id
              )
              .reduce((sum, s) => sum + Number(s.unit_cost), 0) / costs.length
          )
        : 0;
    g.unit_cost = avg;
    g.remaining_qty = Math.max(g.qty - g.billed_qty, 0);
    out.push(g);
  }
  return out.sort(
    (a, b) =>
      a.cost_center_label.localeCompare(b.cost_center_label) ||
      a.name.localeCompare(b.name)
  );
}

// ─── Create ────────────────────────────────────────────────────────────────

/**
 * INVOICE-1 — open a DRAFT invoice for a project: inherit opco / client / site
 * from the project. NO number yet (minted on issue), tax_rate 13, holdback 0.
 */
export async function createInvoiceForProject(
  projectId: string,
  jobId?: string
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

  // PROJ2-4c — resolve the Job. An explicit jobId must belong to this project;
  // otherwise default to the project's Main Job.
  let resolvedJobId: string | null = null;
  if (jobId) {
    const { data: job, error: jErr } = await supabase
      .from("project_jobs")
      .select("id, project_id")
      .eq("id", jobId)
      .maybeSingle();
    if (jErr) throw new Error(`createInvoiceForProject/job: ${jErr.message}`);
    if (!job || (job as { project_id: string }).project_id !== projectId) {
      throw new Error("That job doesn't belong to this project.");
    }
    resolvedJobId = jobId;
  } else {
    const { data: main, error: mErr } = await supabase
      .from("project_jobs")
      .select("id")
      .eq("project_id", projectId)
      .eq("job_type", "main_job")
      .maybeSingle();
    if (mErr) throw new Error(`createInvoiceForProject/mainJob: ${mErr.message}`);
    resolvedJobId = (main as { id: string } | null)?.id ?? null;
  }

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      opco: p.opco,
      project_id: projectId,
      job_id: resolvedJobId,
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

// MATERIALS-1 — bill a project part as a material line. The description is
// composed from the invoice's line_identifier_fields (+ the unit's serial when
// a single serialized unit is billed). source_id carries the cost-center so
// billed quantities can be tracked per (part, cost-center).
export interface MaterialLineInput {
  product_id: string;
  cost_center_id?: string | null;
  qty: number;
  unit_price: number;
  source_stock_ids?: string[];
}

export async function addMaterialLine(
  invoiceId: string,
  input: MaterialLineInput
): Promise<InvoiceMutationResult> {
  const supabase = await db();

  const { data: prod, error: pErr } = await supabase
    .from("inventory_products")
    .select("master_part_number, sku, name, description, is_serialized, tracking_mode")
    .eq("id", input.product_id)
    .maybeSingle();
  if (pErr) throw new Error(`addMaterialLine/product: ${pErr.message}`);
  if (!prod) throw new Error("Part not found.");
  const product = prod as {
    master_part_number: string | null;
    sku: string | null;
    name: string | null;
    description: string | null;
    is_serialized: boolean;
    tracking_mode: string;
  };

  const { data: inv, error: iErr } = await supabase
    .from("invoices")
    .select("line_identifier_fields")
    .eq("id", invoiceId)
    .single();
  if (iErr) throw new Error(`addMaterialLine/invoice: ${iErr.message}`);
  const fields = ((inv as { line_identifier_fields: string[] }).line_identifier_fields) ?? ["name"];

  // A single serialized unit bills with its serial + a source_stock_id link.
  const stockIds = input.source_stock_ids ?? [];
  const singleStockId = stockIds.length === 1 ? stockIds[0] : null;
  let serial: string | null = null;
  if (singleStockId && isSerializedProduct(product)) {
    const { data: unit } = await supabase
      .from("inventory_stock")
      .select("serial_number")
      .eq("id", singleStockId)
      .maybeSingle();
    serial = (unit as { serial_number: string | null } | null)?.serial_number ?? null;
  }

  const qty = input.qty;
  const unitPrice = input.unit_price;
  const description = composeIdentifier(product, fields, serial);
  const sortOrder = await nextSortOrder(supabase, invoiceId);
  const { error } = await supabase.from("invoice_lines").insert({
    invoice_id: invoiceId,
    description,
    quantity: qty,
    unit_price: unitPrice,
    amount: round2(qty * unitPrice),
    source_type: "material",
    source_id: input.cost_center_id ?? null,
    product_id: input.product_id,
    source_stock_id: singleStockId,
    sort_order: sortOrder,
  });
  if (error) throw new Error(`addMaterialLine: ${error.message}`);
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

/**
 * MATERIALS-1 — set which part identifiers compose material line text, then
 * RECOMPOSE every existing material line's description from the new fields (+ a
 * serialized unit's serial). Non-material lines are untouched.
 */
export async function setLineIdentifierFields(
  invoiceId: string,
  fields: string[]
): Promise<InvoiceMutationResult> {
  const supabase = await db();
  // Guard: never persist an empty set — fall back to {name}.
  const safe = fields.length > 0 ? fields : ["name"];
  await patchInvoice(invoiceId, { line_identifier_fields: safe });

  const { data: matLines, error } = await supabase
    .from("invoice_lines")
    .select("id, product_id, source_stock_id")
    .eq("invoice_id", invoiceId)
    .eq("source_type", "material")
    .not("product_id", "is", null);
  if (error) throw new Error(`setLineIdentifierFields/lines: ${error.message}`);
  const lines = (matLines ?? []) as {
    id: string;
    product_id: string;
    source_stock_id: string | null;
  }[];

  if (lines.length > 0) {
    const productIds = [...new Set(lines.map((l) => l.product_id))];
    const { data: prods } = await supabase
      .from("inventory_products")
      .select("id, master_part_number, sku, name, description, is_serialized, tracking_mode")
      .in("id", productIds);
    const productById = new Map(
      ((prods ?? []) as {
        id: string;
        master_part_number: string | null;
        sku: string | null;
        name: string | null;
        description: string | null;
        is_serialized: boolean;
        tracking_mode: string;
      }[]).map((p) => [p.id, p])
    );

    // Serials for the lines that reference a single serialized unit.
    const stockIds = lines
      .map((l) => l.source_stock_id)
      .filter((v): v is string => !!v);
    const serialById = new Map<string, string | null>();
    if (stockIds.length > 0) {
      const { data: units } = await supabase
        .from("inventory_stock")
        .select("id, serial_number")
        .in("id", stockIds);
      for (const u of (units ?? []) as { id: string; serial_number: string | null }[]) {
        serialById.set(u.id, u.serial_number);
      }
    }

    for (const l of lines) {
      const product = productById.get(l.product_id);
      if (!product) continue;
      const serial =
        l.source_stock_id && isSerializedProduct(product)
          ? serialById.get(l.source_stock_id) ?? null
          : null;
      const description = composeIdentifier(product, safe, serial);
      const { error: upErr } = await supabase
        .from("invoice_lines")
        .update({ description })
        .eq("id", l.id);
      if (upErr) throw new Error(`setLineIdentifierFields/update: ${upErr.message}`);
    }
  }

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

// FIN-2 — narrowed to the lifecycle flips the ledger does NOT own: void (a hard
// stop) and re-open (void → sent). 'paid' / 'partially_paid' are now derived
// from the invoice_payments ledger by recordPayment / deletePayment and must
// not be set by a bare flip, which would desync status from the payments.
export async function setInvoiceStatus(
  id: string,
  status: "sent" | "void"
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

// ─── Payments (FIN-2) ────────────────────────────────────────────────────────

// Typed failures the action layer maps to friendly messages and tests assert on.
export type InvoicePaymentErrorCode =
  | "invalid_status"
  | "invalid_amount"
  | "exceeds_balance"
  | "not_found";

export class InvoicePaymentError extends Error {
  code: InvoicePaymentErrorCode;
  constructor(code: InvoicePaymentErrorCode, message: string) {
    super(message);
    this.name = "InvoicePaymentError";
    this.code = code;
  }
}

export interface PaymentResult {
  invoice: DbInvoice;
  payments: DbInvoicePayment[];
}

export async function listPaymentsForInvoice(
  invoiceId: string
): Promise<DbInvoicePayment[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("invoice_payments")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("paid_at", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listPaymentsForInvoice: ${error.message}`);
  return (data ?? []) as DbInvoicePayment[];
}

export interface RecordPaymentInput {
  invoiceId: string;
  amount: number;
  method: DbInvoicePaymentMethod;
  paidAt: string; // yyyy-mm-dd
  reference?: string | null;
  notes?: string | null;
  actorId?: string | null;
}

/**
 * Record a payment against an invoice and re-derive its status from the ledger.
 * Guards: invoice must be open (sent / partially_paid); amount > 0 and within
 * the remaining balance (amount_due − Σ existing payments). No overpayment in
 * v1 — a credit-balance / overpayment model is deferred (flagged in the PR).
 */
export async function recordPayment(
  input: RecordPaymentInput
): Promise<PaymentResult> {
  const supabase = await db();

  const { data: inv, error: iErr } = await supabase
    .from("invoices")
    .select("id, status, amount_due")
    .eq("id", input.invoiceId)
    .maybeSingle();
  if (iErr) throw new Error(`recordPayment/load: ${iErr.message}`);
  if (!inv) throw new InvoicePaymentError("not_found", "Invoice not found.");
  const invoice = inv as { id: string; status: string; amount_due: number };

  if (!isOpenStatus(invoice.status)) {
    throw new InvoicePaymentError(
      "invalid_status",
      "Only a sent or partially-paid invoice can take a payment."
    );
  }

  const amount = round2(input.amount);
  if (!(amount > 0)) {
    throw new InvoicePaymentError(
      "invalid_amount",
      "Payment amount must be greater than zero."
    );
  }

  const existing = await listPaymentsForInvoice(input.invoiceId);
  const paidSoFar = round2(existing.reduce((s, p) => s + Number(p.amount), 0));
  const amountDue = round2(Number(invoice.amount_due));
  const balance = round2(amountDue - paidSoFar);
  if (amount > balance + 0.005) {
    throw new InvoicePaymentError(
      "exceeds_balance",
      `Payment exceeds the remaining balance of ${balance.toFixed(2)}.`
    );
  }

  const { error: insErr } = await supabase.from("invoice_payments").insert({
    invoice_id: input.invoiceId,
    amount,
    method: input.method,
    paid_at: input.paidAt,
    reference: input.reference ?? null,
    notes: input.notes ?? null,
    created_by: input.actorId ?? null,
  });
  if (insErr) throw new Error(`recordPayment/insert: ${insErr.message}`);

  const newTotal = round2(paidSoFar + amount);
  const status = deriveStatusFromPayments(amountDue, newTotal);
  const { data: updated, error: upErr } = await supabase
    .from("invoices")
    .update({ status })
    .eq("id", input.invoiceId)
    .select("*")
    .single();
  if (upErr) throw new Error(`recordPayment/status: ${upErr.message}`);

  // NOTE(audit): invoices carry no audit trail today — issue/void/status flips
  // write no log, and activity_log's entity_type CHECK doesn't include
  // 'invoice'. There is therefore no existing mechanism to mirror best-effort;
  // wiring invoice auditing (its own migration) is tracked as deferred.

  const payments = await listPaymentsForInvoice(input.invoiceId);
  return { invoice: updated as DbInvoice, payments };
}

/**
 * Remove a recorded payment and re-derive the invoice status from what's left
 * (paid → partially_paid when a payment is pulled; last one removed → sent).
 * Blocked once the invoice is void.
 *
 * NOTE(audit): deleting a payment currently leaves no trace of who removed it —
 * there is no invoice audit sink to write to (see recordPayment). No actorId
 * parameter is carried here rather than accepting one and dropping it on the
 * floor; it lands when invoice auditing does.
 */
export async function deletePayment(paymentId: string): Promise<PaymentResult> {
  const supabase = await db();

  const { data: pay, error: pErr } = await supabase
    .from("invoice_payments")
    .select("id, invoice_id")
    .eq("id", paymentId)
    .maybeSingle();
  if (pErr) throw new Error(`deletePayment/load: ${pErr.message}`);
  if (!pay) throw new InvoicePaymentError("not_found", "Payment not found.");
  const invoiceId = (pay as { invoice_id: string }).invoice_id;

  const { data: inv, error: iErr } = await supabase
    .from("invoices")
    .select("status, amount_due")
    .eq("id", invoiceId)
    .maybeSingle();
  if (iErr) throw new Error(`deletePayment/invoice: ${iErr.message}`);
  if (!inv) throw new InvoicePaymentError("not_found", "Invoice not found.");
  const invoice = inv as { status: string; amount_due: number };
  if (invoice.status === "void") {
    throw new InvoicePaymentError(
      "invalid_status",
      "Can't change payments on a void invoice."
    );
  }

  const { error: delErr } = await supabase
    .from("invoice_payments")
    .delete()
    .eq("id", paymentId);
  if (delErr) throw new Error(`deletePayment/delete: ${delErr.message}`);

  const remaining = await listPaymentsForInvoice(invoiceId);
  const total = round2(remaining.reduce((s, p) => s + Number(p.amount), 0));
  const status = deriveStatusFromPayments(round2(Number(invoice.amount_due)), total);
  const { data: updated, error: upErr } = await supabase
    .from("invoices")
    .update({ status })
    .eq("id", invoiceId)
    .select("*")
    .single();
  if (upErr) throw new Error(`deletePayment/status: ${upErr.message}`);

  return { invoice: updated as DbInvoice, payments: remaining };
}
