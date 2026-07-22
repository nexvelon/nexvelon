import "server-only";

// FIN-8 — the per-project (and per-opco) profit & loss statement. Pure
// assembly: every leg already exists in project-cost-rollup.ts, financials.ts,
// deposits.ts or the invoice/bill tables — this file arranges them into an
// accountant-shaped statement and computes ONE gross-profit line. It recomputes
// nothing the rollup already produces.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE COST-BASIS DECISION (the whole point of this chunk).
//
// FIN-5 deliberately kept THREE non-additive cost views because they measure
// different things and OVERLAP:
//   • materials (inventory)  — Σ inventory_stock.unit_cost·qty on the project's
//                              cost centers. Cost of stock DRAWN onto the job.
//   • po_committed           — Σ PO line totals for issued/received POs. What we
//                              ORDERED (a commitment, not yet a cost).
//   • billed_cost            — Σ vendor_bills.subtotal. What suppliers actually
//                              INVOICED us (real money owed/paid).
//
// The overlap that forbids adding them: a part bought on a PO is received into
// inventory (which stamps inventory_stock.unit_cost — the `materials` leg) AND
// later arrives as a vendor bill (the `billed_cost` leg). The SAME dollar shows
// up in both, and there is no per-row link between an inventory_stock row and a
// vendor_bill to net them out in v1. Adding materials + billed_cost would
// double-count every PO-sourced part.
//
// CANONICAL P&L COST = billed_cost (materials) + labour.
//   billed_cost is the real supplier money and the honest "materials actually
//   cost us" figure. Labour is the existing 6b actual-labour leg.
//   Inventory-drawn cost is shown as a SUPPLEMENTARY MEMO line — never added
//   into gross profit — so a reader can still see stock consumption without it
//   silently inflating cost.
//
// REVENUE = Σ invoices.subtotal (PRE-TAX) for issued invoices
//   (sent/partially_paid/paid; draft and void excluded). Tax is a pass-through,
//   out of both revenue and cost — the same rule billed_cost already follows.
//   NOTE: this is NOT the rollup's `invoiced` leg, which is post-tax TOTAL; the
//   P&L needs the pre-tax subtotal, so revenue is queried directly.
//
// This is a MANAGEMENT P&L / bookkeeping aid, not a statutory financial
// statement — the accountant reconciles against the books.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/quote-helpers";
import {
  getProjectCostRollup,
  type JobVarianceBlock,
} from "@/lib/api/project-cost-rollup";
import { getProjectDepositBalance } from "@/lib/api/deposits";
import { ISSUED_STATUSES, OPEN_STATUSES } from "@/lib/api/financials";
import { sumPaymentsByBill } from "@/lib/api/vendor-bills";

async function db() {
  return createSupabaseServerClient();
}

const PROJECT_ACTIVE_STATUSES = [
  "active",
  "on_hold",
  "substantially_complete",
] as const;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PnlRevenue {
  /** Σ invoices.subtotal, issued, pre-tax. */
  invoiced_pretax: number;
  /** Alias of invoiced_pretax — the "earned revenue" P&L line. */
  earned: number;
  /** Pre-tax revenue split by invoice status. */
  by_status: { sent: number; partially_paid: number; paid: number };
}

export interface PnlCost {
  /** Canonical materials cost = Σ vendor-bill subtotals (billed_cost). */
  materials_billed: number | null;
  /** Actual labour (6b labour leg). */
  labour: number | null;
  /** materials_billed + labour — the only cost in the GP math. */
  canonical_direct: number | null;
}

export interface PnlMemo {
  /** Contracted value (quoted / line-item sell total). */
  contract_quoted: number;
  /** Actual − quoted margin drift, from the 6b variance block (null if none). */
  variance_vs_quoted: number | null;
  /** Ordered but not yet billed = max(0, po_committed − billed_cost). */
  po_committed_open: number | null;
  /**
   * Inventory cost DRAWN onto the job — shown, NOT added into gross profit
   * (see the cost-basis note; it overlaps materials_billed for PO-sourced
   * parts). A context line, not a P&L cost.
   */
  inventory_drawn_memo: number | null;
  /** Unapplied deposit credit held against the project (a liability memo). */
  deposits_held: number;
  /** Holdback retained across the project's issued invoices (a receivable). */
  holdback_retained: number;
  /** Open AR: Σ (amount_due − payments) over the project's open invoices. */
  ar_balance: number;
  /** Open AP: Σ balance over the project's open vendor bills. */
  ap_balance: number | null;
  /** invoiced (post-tax) / contract — a completion proxy. */
  billed_pct: number | null;
}

export interface ProjectPnl {
  project: {
    id: string;
    number: string | null;
    title: string | null;
    opco: string;
    client_name: string | null;
    status: string;
  };
  revenue: PnlRevenue;
  cost: PnlCost;
  gross_profit: number | null;
  gross_margin_pct: number | null;
  memo: PnlMemo;
}

// ─── Pre-tax revenue by status ───────────────────────────────────────────────

interface RevenueRow {
  subtotal: number | null;
  status: string;
}

function assembleRevenue(rows: RevenueRow[]): PnlRevenue {
  const by = { sent: 0, partially_paid: 0, paid: 0 };
  let total = 0;
  for (const r of rows) {
    const amt = Number(r.subtotal ?? 0);
    total = round2(total + amt);
    if (r.status === "sent") by.sent = round2(by.sent + amt);
    else if (r.status === "partially_paid")
      by.partially_paid = round2(by.partially_paid + amt);
    else if (r.status === "paid") by.paid = round2(by.paid + amt);
  }
  return { invoiced_pretax: total, earned: total, by_status: by };
}

function grossMarginPct(gp: number, revenue: number): number | null {
  if (revenue <= 0) return null;
  return round2((gp / revenue) * 100);
}

// ─── Per-project P&L ─────────────────────────────────────────────────────────

export async function getProjectPnl(
  projectId: string
): Promise<ProjectPnl | null> {
  const supabase = await db();

  const { data: projRow, error: pErr } = await supabase
    .from("projects")
    .select("id, project_number, title, opco, status, client:clients(name)")
    .eq("id", projectId)
    .maybeSingle();
  if (pErr) throw new Error(`getProjectPnl/project: ${pErr.message}`);
  if (!projRow) return null;
  const proj = projRow as unknown as {
    id: string;
    project_number: string | null;
    title: string | null;
    opco: string;
    status: string;
    client: { name: string } | null;
  };

  // Revenue — pre-tax, issued only, holdback rows too (holdback is a timing
  // reduction of what's DUE, not of what's EARNED).
  const { data: invData, error: iErr } = await supabase
    .from("invoices")
    .select("id, subtotal, holdback_amount, amount_due, status")
    .eq("project_id", projectId)
    .in("status", ISSUED_STATUSES);
  if (iErr) throw new Error(`getProjectPnl/invoices: ${iErr.message}`);
  const invoices = (invData ?? []) as {
    id: string;
    subtotal: number | null;
    holdback_amount: number | null;
    amount_due: number | null;
    status: string;
  }[];

  const revenue = assembleRevenue(invoices);
  const holdbackRetained = round2(
    invoices.reduce((s, r) => s + Number(r.holdback_amount ?? 0), 0)
  );

  // AR balance — open invoices only, amount_due net of payments.
  const openInvoiceIds = invoices
    .filter((r) => (OPEN_STATUSES as readonly string[]).includes(r.status))
    .map((r) => r.id);
  const arBalance = await sumOpenInvoiceBalance(supabase, openInvoiceIds, invoices);

  // Cost legs from the 6b rollup — reused, never recomputed.
  const rollup = await getProjectCostRollup(projectId);
  const r = rollup.perProject;
  const materialsBilled = round2(Number(r.billed_cost ?? 0));
  const labour = round2(Number(r.labour ?? 0));
  const canonicalDirect = round2(materialsBilled + labour);
  const grossProfit = round2(revenue.earned - canonicalDirect);

  // Open PO commitment = ordered − billed (clamped at zero: once billed
  // exceeds ordered the commitment is spent, not negative).
  const poOpen = round2(
    Math.max(0, Number(r.po_committed ?? 0) - materialsBilled)
  );

  // Deposits + AP balance.
  const depositBalance = await getProjectDepositBalance(projectId);
  const apBalance = await getProjectApBalance(supabase, projectId);

  return {
    project: {
      id: proj.id,
      number: proj.project_number,
      title: proj.title,
      opco: proj.opco,
      client_name: proj.client?.name ?? null,
      status: proj.status,
    },
    revenue,
    cost: {
      materials_billed: materialsBilled,
      labour,
      canonical_direct: canonicalDirect,
    },
    gross_profit: grossProfit,
    gross_margin_pct: grossMarginPct(grossProfit, revenue.earned),
    memo: {
      contract_quoted: round2(Number(r.contract ?? 0)),
      variance_vs_quoted: varianceMarginPts(r.variance),
      po_committed_open: poOpen,
      inventory_drawn_memo: round2(Number(r.materials ?? 0)),
      deposits_held: depositBalance.available,
      holdback_retained: holdbackRetained,
      ar_balance: arBalance,
      ap_balance: apBalance,
      billed_pct: r.billed_pct,
    },
  };
}

/** The variance block's actual-vs-baseline margin drift, in dollars of cost. */
function varianceMarginPts(v: JobVarianceBlock | null): number | null {
  if (!v) return null;
  // The cost variance (actual − estimated cost) is the clearest single "did we
  // beat the plan" number for a P&L memo.
  return round2(v.variance.cost);
}

async function sumOpenInvoiceBalance(
  supabase: Awaited<ReturnType<typeof db>>,
  openIds: string[],
  invoices: { id: string; amount_due: number | null }[]
): Promise<number> {
  if (openIds.length === 0) return 0;
  const { data, error } = await supabase
    .from("invoice_payments")
    .select("invoice_id, amount")
    .in("invoice_id", openIds);
  if (error) throw new Error(`sumOpenInvoiceBalance: ${error.message}`);
  const paid = new Map<string, number>();
  for (const p of (data ?? []) as { invoice_id: string; amount: number | null }[]) {
    paid.set(p.invoice_id, round2((paid.get(p.invoice_id) ?? 0) + Number(p.amount ?? 0)));
  }
  let total = 0;
  const byId = new Map(invoices.map((i) => [i.id, Number(i.amount_due ?? 0)]));
  for (const id of openIds) {
    total = round2(total + Math.max(0, round2((byId.get(id) ?? 0) - (paid.get(id) ?? 0))));
  }
  return total;
}

async function getProjectApBalance(
  supabase: Awaited<ReturnType<typeof db>>,
  projectId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("vendor_bills")
    .select("id, total, status")
    .eq("project_id", projectId)
    .in("status", ["received", "partially_paid"]);
  if (error) throw new Error(`getProjectApBalance: ${error.message}`);
  const bills = (data ?? []) as { id: string; total: number | null }[];
  const paidByBill = await sumPaymentsByBill(supabase, bills.map((b) => b.id));
  let total = 0;
  for (const b of bills) {
    total = round2(
      total + Math.max(0, round2(Number(b.total ?? 0) - (paidByBill.get(b.id) ?? 0)))
    );
  }
  return total;
}

// ─── Per-opco P&L ────────────────────────────────────────────────────────────
//
// PROJECT-TO-DATE, never period-scoped and never blended across opcos. The
// two operating companies are separate corporations (same rule as FIN-7's
// remittance) so an omitted opco returns BOTH, separately. Range scoping is
// deliberately NOT offered: the actual-labour leg has no clean period path
// through the rollup, so a "period P&L" would be silently half-right on labour.
// Deferred rather than shipped wrong.

export interface OpcoPnl {
  opco: string;
  project_count: number;
  revenue: number;
  materials_billed: number;
  labour: number;
  canonical_direct: number;
  gross_profit: number;
  gross_margin_pct: number | null;
  memo: {
    contract_quoted: number;
    po_committed_open: number;
    deposits_held: number;
    holdback_retained: number;
    ar_balance: number;
    ap_balance: number;
  };
}

async function activeProjectPnls(): Promise<ProjectPnl[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .in("status", PROJECT_ACTIVE_STATUSES);
  if (error) throw new Error(`activeProjectPnls: ${error.message}`);
  const ids = ((data ?? []) as { id: string }[]).map((p) => p.id);
  const out: ProjectPnl[] = [];
  for (const id of ids) {
    const pnl = await getProjectPnl(id);
    if (pnl) out.push(pnl);
  }
  return out;
}

/**
 * Per-opco P&L across all active projects. `opco` filters to one company;
 * omitted returns every opco separately. NEVER a single blended statement.
 */
export async function getOpcoPnl(
  opts: { opco?: string } = {}
): Promise<OpcoPnl[]> {
  const pnls = await activeProjectPnls();

  const byOpco = new Map<string, OpcoPnl>();
  for (const p of pnls) {
    if (opts.opco && p.project.opco !== opts.opco) continue;
    const row =
      byOpco.get(p.project.opco) ??
      ({
        opco: p.project.opco,
        project_count: 0,
        revenue: 0,
        materials_billed: 0,
        labour: 0,
        canonical_direct: 0,
        gross_profit: 0,
        gross_margin_pct: null,
        memo: {
          contract_quoted: 0,
          po_committed_open: 0,
          deposits_held: 0,
          holdback_retained: 0,
          ar_balance: 0,
          ap_balance: 0,
        },
      } as OpcoPnl);

    row.project_count += 1;
    row.revenue = round2(row.revenue + p.revenue.earned);
    row.materials_billed = round2(row.materials_billed + Number(p.cost.materials_billed ?? 0));
    row.labour = round2(row.labour + Number(p.cost.labour ?? 0));
    row.canonical_direct = round2(row.canonical_direct + Number(p.cost.canonical_direct ?? 0));
    row.gross_profit = round2(row.gross_profit + Number(p.gross_profit ?? 0));
    row.memo.contract_quoted = round2(row.memo.contract_quoted + p.memo.contract_quoted);
    row.memo.po_committed_open = round2(row.memo.po_committed_open + Number(p.memo.po_committed_open ?? 0));
    row.memo.deposits_held = round2(row.memo.deposits_held + p.memo.deposits_held);
    row.memo.holdback_retained = round2(row.memo.holdback_retained + p.memo.holdback_retained);
    row.memo.ar_balance = round2(row.memo.ar_balance + p.memo.ar_balance);
    row.memo.ap_balance = round2(row.memo.ap_balance + Number(p.memo.ap_balance ?? 0));
    byOpco.set(p.project.opco, row);
  }

  for (const row of byOpco.values()) {
    row.gross_margin_pct = grossMarginPct(row.gross_profit, row.revenue);
  }

  return [...byOpco.values()].sort((a, b) => b.revenue - a.revenue);
}

// ─── Portfolio ───────────────────────────────────────────────────────────────

export interface PnlPortfolioRow {
  project_id: string;
  number: string | null;
  title: string | null;
  opco: string;
  status: string;
  revenue: number;
  canonical_direct: number | null;
  gross_profit: number | null;
  gross_margin_pct: number | null;
  billed_pct: number | null;
}

/** One row per active project — for a margin-sortable portfolio table. */
export async function getPnlPortfolio(): Promise<PnlPortfolioRow[]> {
  const pnls = await activeProjectPnls();
  return pnls
    .map((p) => ({
      project_id: p.project.id,
      number: p.project.number,
      title: p.project.title,
      opco: p.project.opco,
      status: p.project.status,
      revenue: p.revenue.earned,
      canonical_direct: p.cost.canonical_direct,
      gross_profit: p.gross_profit,
      gross_margin_pct: p.gross_margin_pct,
      billed_pct: p.memo.billed_pct,
    }))
    .sort((a, b) => (b.gross_margin_pct ?? -Infinity) - (a.gross_margin_pct ?? -Infinity));
}

// ─── CSV exports ─────────────────────────────────────────────────────────────

import { csvField } from "@/lib/aging-buckets";

export function buildProjectPnlCsv(pnl: ProjectPnl): string {
  const rows: [string, string | number | null][] = [
    ["Project", pnl.project.number],
    ["Title", pnl.project.title],
    ["Entity", pnl.project.opco],
    ["Client", pnl.project.client_name],
    ["", ""],
    ["Revenue (earned, pre-tax)", pnl.revenue.earned.toFixed(2)],
    ["Less: Materials (billed)", fmtNeg(pnl.cost.materials_billed)],
    ["Less: Labour", fmtNeg(pnl.cost.labour)],
    ["Gross Profit", pnl.gross_profit == null ? "" : pnl.gross_profit.toFixed(2)],
    ["Gross Margin %", pnl.gross_margin_pct == null ? "" : pnl.gross_margin_pct.toFixed(1)],
    ["", ""],
    ["MEMO — Contract (quoted)", pnl.memo.contract_quoted.toFixed(2)],
    ["MEMO — Cost variance vs plan", pnl.memo.variance_vs_quoted == null ? "" : pnl.memo.variance_vs_quoted.toFixed(2)],
    ["MEMO — Open PO commitment", num(pnl.memo.po_committed_open)],
    ["MEMO — Inventory drawn (not in GP)", num(pnl.memo.inventory_drawn_memo)],
    ["MEMO — Deposits held", pnl.memo.deposits_held.toFixed(2)],
    ["MEMO — Holdback retained", pnl.memo.holdback_retained.toFixed(2)],
    ["MEMO — AR balance", pnl.memo.ar_balance.toFixed(2)],
    ["MEMO — AP balance", num(pnl.memo.ap_balance)],
    ["MEMO — Billed % of contract", pnl.memo.billed_pct == null ? "" : (pnl.memo.billed_pct * 100).toFixed(1)],
  ];
  return rows.map(([k, v]) => `${csvField(k)},${csvField(v)}`).join("\r\n");
}

export const OPCO_PNL_CSV_HEADER = [
  "Entity",
  "Projects",
  "Revenue",
  "Materials (billed)",
  "Labour",
  "Direct cost",
  "Gross profit",
  "Gross margin %",
];

export function buildOpcoPnlCsv(rows: OpcoPnl[]): string {
  const out = [OPCO_PNL_CSV_HEADER.map(csvField).join(",")];
  for (const r of rows) {
    out.push(
      [
        csvField(OPCO_CSV_LABEL[r.opco] ?? r.opco),
        csvField(r.project_count),
        csvField(r.revenue.toFixed(2)),
        csvField(r.materials_billed.toFixed(2)),
        csvField(r.labour.toFixed(2)),
        csvField(r.canonical_direct.toFixed(2)),
        csvField(r.gross_profit.toFixed(2)),
        csvField(r.gross_margin_pct == null ? "" : r.gross_margin_pct.toFixed(1)),
      ].join(",")
    );
  }
  return out.join("\r\n");
}

const OPCO_CSV_LABEL: Record<string, string> = {
  integrated_solutions: "Nexvelon Integrated Solutions",
  guardian: "Nexvelon Guardian",
};

function fmtNeg(v: number | null): string {
  if (v == null) return "";
  return (-v).toFixed(2);
}
function num(v: number | null): string {
  return v == null ? "" : v.toFixed(2);
}
