// PROJ2-6a — pure totals for a Job's line items. Mirrors lib/quotes/totals.ts's
// contract, adapted to the DbJobLineItem shape. The key difference from a quote:
// discount is PER LINE (discount_pct on each row), not a single quote-level
// figure. Tax is intentionally excluded here (the footer shows sell/cost/profit/
// margin only; tax lands with invoicing). Margin is SP-based on the
// post-discount, pre-tax figure — same definition as the quote builder.

import { round2 } from "@/lib/quote-helpers";

export interface JobLineItemTotalsInput {
  quantity: number;
  unit_cost: number;
  unit_price: number;
  discount_pct: number;
}

export interface JobLineItemTotals {
  sellSubtotal: number; // Σ qty × unit_price (pre-discount)
  discountTotal: number; // Σ per-line discount
  sellAfterDiscount: number; // sellSubtotal − discountTotal
  costTotal: number; // Σ qty × unit_cost
  profit: number; // sellAfterDiscount − costTotal
  marginPct: number | null; // null when sellAfterDiscount ≤ 0
}

/** One line's sell total: qty × unit_price × (1 − discount_pct/100). Unrounded —
 *  callers round the SUM to 2dp (the locked PROJ2-6b sync rule). */
export function lineSellTotal(
  quantity: number,
  unitPrice: number,
  discountPct: number
): number {
  const qty = Number(quantity) || 0;
  const price = Number(unitPrice) || 0;
  const disc = Number(discountPct) || 0;
  return qty * price * (1 - disc / 100);
}

export function computeJobLineItemTotals(
  items: JobLineItemTotalsInput[]
): JobLineItemTotals {
  let sell = 0;
  let discount = 0;
  let cost = 0;
  for (const li of items) {
    const qty = Number(li.quantity) || 0;
    const lineSell = qty * (Number(li.unit_price) || 0);
    const lineDiscount = lineSell * ((Number(li.discount_pct) || 0) / 100);
    sell += lineSell;
    discount += lineDiscount;
    cost += qty * (Number(li.unit_cost) || 0);
  }

  const sellSubtotal = round2(sell);
  const discountTotal = round2(discount);
  const sellAfterDiscount = round2(sellSubtotal - discountTotal);
  const costTotal = round2(cost);
  const profit = round2(sellAfterDiscount - costTotal);
  const marginPct =
    sellAfterDiscount > 0
      ? round2((profit / sellAfterDiscount) * 100)
      : null;

  return {
    sellSubtotal,
    discountTotal,
    sellAfterDiscount,
    costTotal,
    profit,
    marginPct,
  };
}

// ── PROJ2-6b — Quoted / Estimated legs for the variance panel ────────────────

export interface JobLineVarianceInput {
  line_kind: string; // 'part' | 'labour'
  quantity: number;
  unit_cost: number;
  unit_price: number;
  discount_pct: number;
  quoted_quantity: number | null;
  quoted_unit_cost: number | null;
  quoted_unit_price: number | null;
  quoted_discount_pct: number | null;
}

export interface VarianceLeg {
  revenue: number; // Σ sell totals
  materials: number; // Σ line_kind='part' qty × unit_cost
  labour: number; // Σ line_kind='labour' qty × unit_cost
  cost: number; // materials + labour
  margin_pct: number | null; // (revenue − cost) / revenue × 100; null when revenue ≤ 0
}

function legFrom(
  rows: Array<{
    kind: string;
    qty: number;
    unitCost: number;
    unitPrice: number;
    discountPct: number;
  }>
): VarianceLeg {
  let revenue = 0;
  let materials = 0;
  let labour = 0;
  for (const r of rows) {
    revenue += lineSellTotal(r.qty, r.unitPrice, r.discountPct);
    const c = (Number(r.qty) || 0) * (Number(r.unitCost) || 0);
    if (r.kind === "labour") labour += c;
    else materials += c;
  }
  const rev = round2(revenue);
  const mat = round2(materials);
  const lab = round2(labour);
  const cost = round2(mat + lab);
  return {
    revenue: rev,
    materials: mat,
    labour: lab,
    cost,
    margin_pct: rev > 0 ? round2(((rev - cost) / rev) * 100) : null,
  };
}

/** The Quoted leg (from the §2.2 quoted_* snapshots — lines without a snapshot
 *  are skipped) and the Estimated leg (current live values, all lines). A Job
 *  with no snapshotted lines has no quoted baseline (fully manual Job). */
export function computeQuotedEstimatedLegs(lines: JobLineVarianceInput[]): {
  quoted: VarianceLeg;
  estimated: VarianceLeg;
  hasQuotedBaseline: boolean;
} {
  const snapshotted = lines.filter((l) => l.quoted_quantity != null);
  const quoted = legFrom(
    snapshotted.map((l) => ({
      kind: l.line_kind,
      qty: Number(l.quoted_quantity ?? 0),
      unitCost: Number(l.quoted_unit_cost ?? 0),
      unitPrice: Number(l.quoted_unit_price ?? 0),
      discountPct: Number(l.quoted_discount_pct ?? 0),
    }))
  );
  const estimated = legFrom(
    lines.map((l) => ({
      kind: l.line_kind,
      qty: l.quantity,
      unitCost: l.unit_cost,
      unitPrice: l.unit_price,
      discountPct: l.discount_pct,
    }))
  );
  return { quoted, estimated, hasQuotedBaseline: snapshotted.length > 0 };
}
