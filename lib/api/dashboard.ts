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
import { businessDateISO } from "@/lib/format";
import { round2 } from "@/lib/quote-helpers";
import { getRevenueSummary, getHstNetPosition } from "@/lib/api/financials";
import { getArAgingSummary } from "@/lib/api/ar-aging";
import { getApSummary } from "@/lib/api/vendor-bills";
import { getDepositsHeldTotal } from "@/lib/api/deposits";
import { getWipPortfolio } from "@/lib/api/wip";
import { getPnlPortfolio } from "@/lib/api/project-pnl";
import { listQuotes } from "@/lib/api/quotes";

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
  tiers: DashboardTiers;
}): Promise<DashboardKpis> {
  const today = businessDateISO();
  const finRange = { from: input.from, to: input.to };
  const { tiers } = input;

  const [rev, ar, ap, dep, wip, hst, pnl, proj, quo] = await Promise.all([
    tiers.financialView ? getRevenueSummary(finRange) : null,
    tiers.financialView ? getArAgingSummary() : null,
    tiers.financialView ? getApSummary(today) : null,
    tiers.financialView ? getDepositsHeldTotal() : null,
    tiers.financialEdit ? getWipPortfolio() : null,
    tiers.financialEdit ? getHstNetPosition(finRange) : null,
    tiers.financialEdit ? getPnlPortfolio() : null,
    tiers.projects ? activeProjectsSummary() : null,
    tiers.quotes ? openQuotesSummary() : null,
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
