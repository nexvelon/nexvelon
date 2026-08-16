import "server-only";

// DASH-1 — the dashboard KPI fan-out. ONE server read that calls the real
// financial + operational sources and returns a structured, tier-partitioned
// shape. The ACTION decides which tiers a caller may see (from permissions) and
// passes them in; this lib fetches only the enabled tiers (an unseen tier is not
// queried) and returns its block as `null`.
//
// HONESTY (§2.8): a `null` BLOCK means "restricted — you can't see this"; a
// number (including 0) means a real value. There are NO fabricated figures here
// — no EBITDA (there is no opex tracking), no ratio-derived margin. Blended
// margin is the REAL P&L margin (ΣGP / Σrevenue), and is `null` only when there
// is genuinely no revenue to divide by (not a restriction).

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { businessDateISO, businessDatePlusDaysISO } from "@/lib/format";
import { daysBetween } from "@/lib/aging-buckets";
import { round2 } from "@/lib/quote-helpers";
import {
  getRevenueSummary,
  getHstNetPosition,
  getMonthlyRevenue,
  ISSUED_STATUSES,
  type MonthlyRevenuePoint,
} from "@/lib/api/financials";
import { getInventoryReportData, listProducts } from "@/lib/api/products";
import { getArAgingSummary } from "@/lib/api/ar-aging";
import { getApSummary } from "@/lib/api/vendor-bills";
import { getDepositsHeldTotal } from "@/lib/api/deposits";
import { getWipPortfolio } from "@/lib/api/wip";
import { getPnlPortfolio } from "@/lib/api/project-pnl";
import { listQuotes } from "@/lib/api/quotes";
import { getComplianceRisk } from "@/lib/api/subcontractor-compliance";
import { getBondAlerts } from "@/lib/api/project-bonds";
import { getExpiringTechCerts } from "@/lib/api/tech-certifications";
import { getExpiringWarranties } from "@/lib/api/warranties";
import { getDispatchBoard } from "@/lib/api/dispatch-board";
import { OPEN_TASK_STATUSES } from "@/lib/tasks/task-status";
import { summarizeDeficiencies } from "@/lib/deficiencies/deficiency-status";
import type {
  DbActivityLog,
  DbDeficiencySeverity,
  DbDeficiencyStatus,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

// The DB status set for "active" (open) projects — the same set
// getProjectFinancialSummaries uses. Closed/cancelled are excluded.
const ACTIVE_PROJECT_STATUSES = ["active", "on_hold", "substantially_complete"];
// Open quote statuses (the live pipeline; Approved/Revision/Closed excluded).
const OPEN_QUOTE_STATUSES = new Set(["Draft", "Sent"]);

export interface DashboardTiers {
  financialView: boolean; // revenue, cash, AR, AP, deposits
  financialEdit: boolean; // WIP, HST net, blended margin (cost-side)
  projects: boolean; // active projects + contract value
  quotes: boolean; // open quotes + value
}

export interface DashboardKpis {
  range: { from: string | null; to: string | null };
  as_of: string; // real today (business date)
  // null block = restricted. Numbers (incl 0) = real.
  financial: {
    revenue: number; // getRevenueSummary(range).total — range-aware
    cash_collected: number; // .cashCollected — range-aware (cash date)
    ar_outstanding: number; // getArAgingSummary().total — snapshot
    ar_overdue: number; // .overdueTotal
    ap_outstanding: number; // getApSummary(today).outstanding — snapshot
    ap_overdue: number; // .overdue
    deposits_held: number; // getDepositsHeldTotal() — snapshot
    /** UIDG-6B — prior-period values for the FLOW metrics only (revenue, cash),
     *  computed over the caller's comparison window. null when no comparison was
     *  requested. Point-in-time balances (AR/AP/deposits) are NOT compared — there
     *  is no stored historical snapshot to compare them against. Gated identically
     *  to the current values (same financialView guard). */
    compare: { revenue: number; cash_collected: number } | null;
  } | null;
  financial_edit: {
    wip_net: number; // getWipPortfolio().totals.net — snapshot
    wip_overbilled: number;
    wip_underbilled: number;
    hst_net_total: number; // getHstNetPosition(range).totals.net — range-aware
    hst_by_opco: { opco: string; net: number }[];
    blended_margin_pct: number | null; // ΣGP/Σrevenue; null when NO revenue
  } | null;
  operational: {
    projects: { active_projects: number; active_contract_value: number } | null;
    quotes: { open_quotes: number; open_quotes_value: number } | null;
  };
}

async function activeProjectsSummary(): Promise<{
  active_projects: number;
  active_contract_value: number;
}> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("projects")
    .select("contract_value")
    .in("status", ACTIVE_PROJECT_STATUSES);
  if (error) throw new Error(`dashboard/activeProjects: ${error.message}`);
  const rows = (data ?? []) as { contract_value: number | null }[];
  return {
    active_projects: rows.length,
    active_contract_value: round2(rows.reduce((s, r) => s + Number(r.contract_value ?? 0), 0)),
  };
}

async function openQuotesSummary(): Promise<{
  open_quotes: number;
  open_quotes_value: number;
}> {
  const quotes = await listQuotes();
  const open = quotes.filter((q) => OPEN_QUOTE_STATUSES.has(q.status));
  return {
    open_quotes: open.length,
    open_quotes_value: round2(open.reduce((s, q) => s + Number(q.total ?? 0), 0)),
  };
}

export async function getDashboardKpis(input: {
  from?: string;
  to?: string;
  /** UIDG-6B — the prior (comparison) window for the flow metrics. Both required
   *  for a comparison; omit for none. Computed by the caller (comparisonRange). */
  compareFrom?: string;
  compareTo?: string;
  tiers: DashboardTiers;
}): Promise<DashboardKpis> {
  const today = businessDateISO();
  const finRange = { from: input.from, to: input.to };
  const { tiers } = input;
  // The prior-period read is gated by the SAME financialView flag as the current
  // revenue read — a caller who can't see current revenue never triggers, nor
  // receives, the prior figure.
  const wantCompare = tiers.financialView && !!(input.compareFrom && input.compareTo);

  const [rev, ar, ap, dep, wip, hst, pnl, proj, quo, priorRev] = await Promise.all([
    tiers.financialView ? getRevenueSummary(finRange) : null,
    tiers.financialView ? getArAgingSummary() : null,
    tiers.financialView ? getApSummary(today) : null,
    tiers.financialView ? getDepositsHeldTotal() : null,
    tiers.financialEdit ? getWipPortfolio() : null,
    tiers.financialEdit ? getHstNetPosition(finRange) : null,
    tiers.financialEdit ? getPnlPortfolio() : null,
    tiers.projects ? activeProjectsSummary() : null,
    tiers.quotes ? openQuotesSummary() : null,
    wantCompare ? getRevenueSummary({ from: input.compareFrom, to: input.compareTo }) : null,
  ]);

  const financial =
    rev && ar && ap != null && dep != null
      ? {
          revenue: rev.total,
          cash_collected: rev.cashCollected,
          ar_outstanding: ar.total,
          ar_overdue: ar.overdueTotal,
          ap_outstanding: ap.outstanding,
          ap_overdue: ap.overdue,
          deposits_held: dep,
          compare: priorRev
            ? { revenue: priorRev.total, cash_collected: priorRev.cashCollected }
            : null,
        }
      : null;

  let financial_edit: DashboardKpis["financial_edit"] = null;
  if (wip && hst && pnl) {
    const totalRevenue = round2(pnl.reduce((s, r) => s + Number(r.revenue ?? 0), 0));
    const totalGp = round2(pnl.reduce((s, r) => s + Number(r.gross_profit ?? 0), 0));
    financial_edit = {
      wip_net: wip.totals.net,
      wip_overbilled: wip.totals.overbilled,
      wip_underbilled: wip.totals.underbilled,
      hst_net_total: hst.totals.net,
      hst_by_opco: hst.byOpco.map((o) => ({ opco: o.opco, net: o.net })),
      blended_margin_pct: totalRevenue > 0 ? round2((totalGp / totalRevenue) * 100) : null,
    };
  }

  return {
    range: { from: input.from ?? null, to: input.to ?? null },
    as_of: today,
    financial,
    financial_edit,
    operational: { projects: proj, quotes: quo },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// DASH-2 — cross-portfolio alert/worklist aggregates. Each is ONE cross-project
// query (every source table carries project_id) aggregated in JS. Pure reads.
// ────────────────────────────────────────────────────────────────────────────

/** project_id → "P-1042 — Title" label, for the aggregates below. */
async function projectLabels(
  supabase: Awaited<ReturnType<typeof db>>,
  ids: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return out;
  const { data } = await supabase
    .from("projects")
    .select("id, project_number, title")
    .in("id", unique);
  for (const p of (data ?? []) as { id: string; project_number: string; title: string | null }[]) {
    out.set(p.id, p.title ? `${p.project_number} — ${p.title}` : p.project_number);
  }
  return out;
}

export interface OverdueTaskItem {
  task_id: string;
  title: string;
  project: string;
  due_date: string;
  days_overdue: number;
}

export async function getPortfolioOverdueTasks(): Promise<{
  count: number;
  items: OverdueTaskItem[];
}> {
  const supabase = await db();
  const today = businessDateISO();
  const { data, error } = await supabase
    .from("job_tasks")
    .select("id, title, project_id, due_date, status")
    .in("status", OPEN_TASK_STATUSES)
    .not("due_date", "is", null)
    .lt("due_date", today) // due TODAY is not overdue (matches isOverdue)
    .order("due_date", { ascending: true });
  if (error) throw new Error(`getPortfolioOverdueTasks: ${error.message}`);
  const rows = (data ?? []) as { id: string; title: string; project_id: string; due_date: string }[];
  const labels = await projectLabels(supabase, rows.map((r) => r.project_id));
  return {
    count: rows.length,
    items: rows.slice(0, 6).map((r) => ({
      task_id: r.id,
      title: r.title,
      project: labels.get(r.project_id) ?? "—",
      due_date: r.due_date,
      days_overdue: daysBetween(r.due_date, today),
    })),
  };
}

export async function getPortfolioDeficiencies(): Promise<{
  open: number;
  safety_open: number;
  projects_affected: number;
}> {
  const supabase = await db();
  const today = businessDateISO();
  const { data, error } = await supabase
    .from("job_deficiencies")
    .select("project_id, status, severity, due_date");
  if (error) throw new Error(`getPortfolioDeficiencies: ${error.message}`);
  const rows = (data ?? []) as {
    project_id: string; status: DbDeficiencyStatus; severity: DbDeficiencySeverity; due_date: string | null;
  }[];
  const counts = summarizeDeficiencies(
    rows.map((r) => ({ status: r.status, severity: r.severity, due_date: r.due_date })),
    today
  );
  // projects with at least one OPEN deficiency
  const affected = new Set<string>();
  for (const r of rows) {
    const c = summarizeDeficiencies([{ status: r.status, severity: r.severity, due_date: r.due_date }], today);
    if (c.open > 0) affected.add(r.project_id);
  }
  return { open: counts.open, safety_open: counts.open_safety, projects_affected: affected.size };
}

export interface UpcomingMilestoneItem {
  milestone_id: string;
  title: string;
  project: string;
  target_date: string;
  days_until: number;
}

export async function getUpcomingMilestones(opts: { days?: number } = {}): Promise<{
  items: UpcomingMilestoneItem[];
}> {
  const supabase = await db();
  const today = businessDateISO();
  const to = businessDatePlusDaysISO(opts.days ?? 14);
  const { data, error } = await supabase
    .from("schedule_milestones")
    .select("id, title, project_id, target_date, status")
    .eq("status", "pending")
    .gte("target_date", today)
    .lte("target_date", to)
    .order("target_date", { ascending: true });
  if (error) throw new Error(`getUpcomingMilestones: ${error.message}`);
  const rows = (data ?? []) as { id: string; title: string; project_id: string; target_date: string }[];
  const labels = await projectLabels(supabase, rows.map((r) => r.project_id));
  return {
    items: rows.map((r) => ({
      milestone_id: r.id,
      title: r.title,
      project: labels.get(r.project_id) ?? "—",
      target_date: r.target_date,
      days_until: daysBetween(today, r.target_date),
    })),
  };
}

export interface RecentActivityItem {
  id: string;
  entity_type: string;
  action: string;
  created_at: string;
  actor_name: string | null;
}

export async function getRecentActivity(opts: { limit?: number } = {}): Promise<{
  items: RecentActivityItem[];
}> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("activity_log")
    .select("id, entity_type, action, actor_id, created_at")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 15);
  if (error) throw new Error(`getRecentActivity: ${error.message}`);
  const rows = (data ?? []) as (Pick<DbActivityLog, "id" | "entity_type" | "action" | "actor_id" | "created_at">)[];

  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((v): v is string => !!v))];
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name, first_name, last_name, email")
      .in("id", actorIds);
    for (const p of (profs ?? []) as {
      id: string; display_name: string | null; first_name: string | null; last_name: string | null; email: string;
    }[]) {
      const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      names.set(p.id, p.display_name?.trim() || full || p.email);
    }
  }
  return {
    items: rows.map((r) => ({
      id: r.id,
      entity_type: r.entity_type,
      action: r.action,
      created_at: r.created_at,
      actor_name: r.actor_id ? names.get(r.actor_id) ?? null : null,
    })),
  };
}

// ── The alerts fan-out (tier-gated blocks) ──────────────────────────────────

export interface DashboardAlertsTiers {
  subs: boolean; // subcontractors:view
  projects: boolean; // projects:view
  scheduling: boolean; // scheduling:view
}

export interface DashboardAlerts {
  compliance_at_risk:
    | { expired: number; expiring_soon: number; missing_required: number; total_at_risk: number }
    | null;
  bond_warranty_alerts:
    | { bonds: number; warranties: number; expired: number; expiring_soon: number }
    | null;
  overdue_tasks: { count: number; items: OverdueTaskItem[] } | null;
  deficiencies: { open: number; safety_open: number; projects_affected: number } | null;
  upcoming_milestones: { items: UpcomingMilestoneItem[] } | null;
  dispatch_today:
    | { booked_today: number; unscheduled: number; techs_out: number; utilization_pct: number | null }
    | null;
  // DES-2 — technician certs expired or expiring soon (scheduling:view tier).
  tech_cert_alerts:
    | { expired: number; expiring_soon: number; total_at_risk: number }
    | null;
}

export async function getDashboardAlerts(input: {
  tiers: DashboardAlertsTiers;
}): Promise<DashboardAlerts> {
  const { tiers } = input;
  const today = businessDateISO();

  const [compliance, bonds, warranties, tasks, defs, milestones, board, certAlerts] = await Promise.all([
    tiers.subs ? getComplianceRisk() : null,
    tiers.projects ? getBondAlerts() : null,
    tiers.projects ? getExpiringWarranties() : null,
    tiers.projects ? getPortfolioOverdueTasks() : null,
    tiers.projects ? getPortfolioDeficiencies() : null,
    tiers.projects ? getUpcomingMilestones({ days: 14 }) : null,
    tiers.scheduling
      ? getDispatchBoard({ from: `${today}T00:00:00.000Z`, to: `${today}T23:59:59.999Z` })
      : null,
    tiers.scheduling ? getExpiringTechCerts({}) : null,
  ]);

  return {
    compliance_at_risk: compliance
      ? {
          expired: compliance.counts.expired,
          expiring_soon: compliance.counts.expiring_soon,
          missing_required: compliance.counts.missing_required,
          total_at_risk:
            compliance.counts.expired + compliance.counts.expiring_soon + compliance.counts.missing_required,
        }
      : null,
    bond_warranty_alerts:
      bonds && warranties
        ? {
            bonds: bonds.length,
            warranties: warranties.length,
            expired: [...bonds, ...warranties].filter((a) => a.state === "expired").length,
            expiring_soon: [...bonds, ...warranties].filter((a) => a.state === "expiring_soon").length,
          }
        : null,
    overdue_tasks: tasks,
    deficiencies: defs,
    upcoming_milestones: milestones,
    dispatch_today: board
      ? {
          booked_today: board.bookings.length,
          unscheduled: board.unscheduled.length,
          techs_out: board.stats.techs_out,
          utilization_pct: board.stats.utilization_pct,
        }
      : null,
    tech_cert_alerts: certAlerts
      ? {
          expired: certAlerts.filter((c) => c.state === "expired").length,
          expiring_soon: certAlerts.filter((c) => c.state === "expiring_soon").length,
          total_at_risk: certAlerts.length,
        }
      : null,
  };
}

// DASH-2 — a real quotes-by-status breakdown (replaces the fabricated funnel's
// "Lead = quoted × 1.6"). Statuses come from listQuotes (the app-level blob
// status), never the stale DB mirror column. Open pipeline value = Draft+Sent.
export interface QuotesByStatus {
  by_status: { status: string; count: number; value: number }[];
  open_pipeline_value: number;
}

export async function getQuotesByStatus(): Promise<QuotesByStatus> {
  const quotes = await listQuotes();
  const agg = new Map<string, { count: number; value: number }>();
  let openValue = 0;
  for (const q of quotes) {
    const cur = agg.get(q.status) ?? { count: 0, value: 0 };
    cur.count += 1;
    cur.value = round2(cur.value + Number(q.total ?? 0));
    agg.set(q.status, cur);
    if (q.status === "Draft" || q.status === "Sent") openValue = round2(openValue + Number(q.total ?? 0));
  }
  return {
    by_status: [...agg.entries()].map(([status, v]) => ({ status, count: v.count, value: v.value })),
    open_pipeline_value: openValue,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// DASH-3 — the final three panels, wired to real reads. Pure derivation.
// ────────────────────────────────────────────────────────────────────────────

// Trailing-12-months invoiced revenue + cash collected, by month. NO fabricated
// EBITDA series (the mock had one; there's no opex tracking).
export async function getRevenueTrend(): Promise<MonthlyRevenuePoint[]> {
  return getMonthlyRevenue({ months: 12 });
}

export interface TopClientRow {
  client_id: string;
  client_name: string;
  revenue: number; // pre-tax (subtotal), issued invoices (sent/partially_paid/paid), in year
  invoice_count: number;
}

export async function getTopClientsByRevenue(opts: {
  year?: number;
  limit?: number;
} = {}): Promise<TopClientRow[]> {
  const supabase = await db();
  const year = opts.year ?? new Date().getFullYear();
  const { data, error } = await supabase
    .from("invoices")
    .select("client_id, subtotal, status, issue_date")
    .in("status", [...ISSUED_STATUSES])
    .gte("issue_date", `${year}-01-01`)
    .lte("issue_date", `${year}-12-31`);
  if (error) throw new Error(`getTopClientsByRevenue: ${error.message}`);
  const rows = (data ?? []) as { client_id: string; subtotal: number | null }[];

  const agg = new Map<string, { revenue: number; invoice_count: number }>();
  for (const r of rows) {
    const cur = agg.get(r.client_id) ?? { revenue: 0, invoice_count: 0 };
    cur.revenue = round2(cur.revenue + Number(r.subtotal ?? 0));
    cur.invoice_count += 1;
    agg.set(r.client_id, cur);
  }
  const clientIds = [...agg.keys()];
  const names = new Map<string, string>();
  if (clientIds.length > 0) {
    const { data: clients } = await supabase.from("clients").select("id, name").in("id", clientIds);
    for (const c of (clients ?? []) as { id: string; name: string }[]) names.set(c.id, c.name);
  }
  return clientIds
    .map((id) => ({
      client_id: id,
      client_name: names.get(id) ?? "—",
      revenue: agg.get(id)!.revenue,
      invoice_count: agg.get(id)!.invoice_count,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, opts.limit ?? 5);
}

export interface InventoryHealth {
  by_category: { category: string; value: number }[];
  low_stock: { product_id: string; name: string; on_hand: number; reorder_point: number }[];
  low_stock_count: number;
}

export async function getInventoryHealth(): Promise<InventoryHealth> {
  const [report, products] = await Promise.all([getInventoryReportData(), listProducts()]);
  const low = products.filter((p) => p.stock <= p.reorderPoint);
  return {
    by_category: report.valuationByCategory
      .map((c) => ({ category: c.category || "Uncategorized", value: round2(c.value) }))
      .sort((a, b) => b.value - a.value),
    low_stock: low.map((p) => ({
      product_id: p.id,
      name: p.name,
      on_hand: p.stock,
      reorder_point: p.reorderPoint,
    })),
    low_stock_count: low.length,
  };
}
