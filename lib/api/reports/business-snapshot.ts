import "server-only";

// REP-4 — the honest business snapshot. REAL operating metrics only, assembled
// from existing reads. Deliberately NOT a valuation:
//
//   • NO valuation multiple, NO enterprise value — there is no earnings-multiple
//     or comparable-transaction source, so any such number would be fabricated.
//   • NO recurring-revenue / MRR line — nothing in the system models recurring
//     contracts as a revenue stream, so MRR cannot be derived.
//   • NO bank-cash balance — the system holds no cash-account ledger, so a
//     literal "cash on hand" figure would be invented. The working-capital
//     position (AR − AP) is shown instead, from real balances.
//
// The report view labels this "operating snapshot — not a business valuation."

import { getMonthlyRevenue } from "@/lib/api/financials";
import { getArAgingSummary } from "@/lib/api/ar-aging";
import { getApSummary } from "@/lib/api/vendor-bills";
import { getPnlPortfolio } from "@/lib/api/project-pnl";
import { getWipPortfolio } from "@/lib/api/wip";
import { round2 } from "@/lib/quote-helpers";
import { businessDateISO } from "@/lib/format";

/** Trailing complete months averaged into the annualized run-rate. */
export const RUN_RATE_MONTHS = 3;

export interface BusinessSnapshot {
  /** Annualized: avg invoiced over the last RUN_RATE_MONTHS complete months ×12. */
  revenue_run_rate: number;
  run_rate_basis_months: number;
  /** Σ gross profit ÷ Σ revenue across active projects (null when no revenue). */
  blended_margin_pct: number | null;
  /** Σ (contract − billed) over active projects — signed work not yet invoiced. */
  contract_backlog: number;
  /** Open receivables (money owed to us). */
  ar_outstanding: number;
  /** Open payables (money we owe). */
  ap_outstanding: number;
  /** Working-capital position = AR − AP. NOT a bank-cash balance. */
  net_position: number;
  as_of: string;
}

export async function getBusinessSnapshot(): Promise<BusinessSnapshot> {
  const asOf = businessDateISO();

  const [monthly, ar, ap, portfolio, wip] = await Promise.all([
    // Pull one extra month so the current (partial) month can be dropped.
    getMonthlyRevenue({ months: RUN_RATE_MONTHS + 1 }),
    getArAgingSummary(),
    getApSummary(asOf),
    getPnlPortfolio(),
    getWipPortfolio(),
  ]);

  // Run-rate: drop the current (in-progress) month, average the trailing
  // complete months, annualize ×12. getMonthlyRevenue returns oldest→newest.
  const complete = monthly.slice(0, -1);
  const basis = complete.slice(-RUN_RATE_MONTHS);
  const avgInvoiced =
    basis.length > 0 ? basis.reduce((s, m) => s + m.invoiced, 0) / basis.length : 0;
  const revenueRunRate = round2(avgInvoiced * 12);

  // Blended margin across active projects.
  const revenue = round2(portfolio.reduce((s, p) => s + p.revenue, 0));
  const grossProfit = round2(portfolio.reduce((s, p) => s + Number(p.gross_profit ?? 0), 0));
  const blendedMargin = revenue > 0 ? round2((grossProfit / revenue) * 100) : null;

  // Contract backlog = Σ (contract − billed) over active projects.
  const contractBacklog = round2(
    wip.rows.reduce((s, r) => s + (Number(r.contract ?? 0) - Number(r.billed ?? 0)), 0)
  );

  const arOutstanding = round2(ar.total);
  const apOutstanding = round2(ap.outstanding);

  return {
    revenue_run_rate: revenueRunRate,
    run_rate_basis_months: basis.length,
    blended_margin_pct: blendedMargin,
    contract_backlog: contractBacklog,
    ar_outstanding: arOutstanding,
    ap_outstanding: apOutstanding,
    net_position: round2(arOutstanding - apOutstanding),
    as_of: asOf,
  };
}
