// INV-FIX-1 — how a quote line draws its cost from real stock lots. Pure +
// client-safe, so the builder, the server actions and the tests share one rule.
//
// THE METHOD IS UNCHANGED: SPECIFIC IDENTIFICATION (Session AB §3.4). Every draw
// carries the cost of the exact lot it comes from — nothing is averaged, nothing
// is FIFO-costed. What this module adds is the DEFAULT for WHICH lot(s) a line
// draws from, and the ability for one line to draw from several lots.
//
// THE DEFAULT RULE — oldest receipt first (Gap 1). For interchangeable stock the
// choice of box is arbitrary, so the system needs a neutral rule instead of the
// old CHEAPEST-first ordering, which quietly flattered margins (it always offered
// the lowest cost). Oldest-first:
//   • matches physical stock rotation (the oldest box is the one to use up);
//   • is the rule Canadian GAAP expects for interchangeable items;
//   • is neutral — it can't be steered towards a better-looking margin.
// It is only a default: a person can still choose particular lots (e.g. the exact
// serialized camera installed), and that choice is recorded as manual.
//
// ELIGIBLE LOTS for the automatic plan: status 'in_stock', not on an RMA, and NOT
// already placed on a job (current_cost_center_id set) — stock moved onto a job is
// that job's, and auto-drawing it into another quote would take someone else's
// parts. Lots with no receipt date sort after dated lots (they can't be proven
// oldest), then by id for a stable order.

export type StockSource = "auto" | "manual";

/** A planned draw: qty from one lot at that lot's own cost (snapshot, §2.2). */
export interface StockDraw {
  stockId: string;
  qty: number;
  /** The lot's unit cost when planned. Null on the wire for cost-blind roles (SEC-1). */
  unitCost: number | null;
  acquiredAt?: string | null;
  poNumber?: string | null;
  serialNumber?: string | null;
  location?: string | null;
}

/** A committed draw: what actually left stock, traceable to its receipt lot. */
export interface CommittedDraw {
  sourceStockId: string;
  consumedRowId: string;
  qty: number;
  unitCost: number | null;
  serialNumber?: string | null;
}

/** Where a line's cost figure comes from (§2.8 — every cost says what it is). */
export type CostSource = "stock" | "partial_estimate" | "catalog_estimate" | "manual";

export interface LotForPlanning {
  id: string;
  quantity: number;
  unit_cost: number | null;
  status: string;
  acquired_at: string | null;
  po_number?: string | null;
  serial_number?: string | null;
  location?: string | null;
  current_cost_center_id?: string | null;
  rma_status?: string | null;
  created_at?: string | null;
}

export interface DrawPlan {
  draws: StockDraw[];
  /** Units the eligible stock couldn't cover. */
  shortfall: number;
}

/** A lot the automatic plan may draw from. */
export function isAutoEligible(l: LotForPlanning): boolean {
  return (
    l.status === "in_stock" &&
    !l.current_cost_center_id &&
    !l.rma_status &&
    Number(l.quantity) > 0
  );
}

/** Oldest receipt first; undated lots last; then created_at, then id. */
export function compareOldestFirst(a: LotForPlanning, b: LotForPlanning): number {
  const ad = a.acquired_at ?? null;
  const bd = b.acquired_at ?? null;
  if (ad && bd && ad !== bd) return ad < bd ? -1 : 1;
  if (ad && !bd) return -1;
  if (!ad && bd) return 1;
  const ac = a.created_at ?? "";
  const bc = b.created_at ?? "";
  if (ac !== bc) return ac < bc ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Plan `qty` units oldest-first across eligible lots. `reserved` is what OTHER
 * uncommitted lines of the same quote already plan from each lot, so two lines of
 * one part don't both claim the same box.
 */
export function planOldestFirst(
  lots: LotForPlanning[],
  qty: number,
  reserved: ReadonlyMap<string, number> = new Map()
): DrawPlan {
  let need = Math.max(0, Math.trunc(qty));
  const draws: StockDraw[] = [];
  for (const lot of lots.filter(isAutoEligible).sort(compareOldestFirst)) {
    if (need <= 0) break;
    const available = Number(lot.quantity) - (reserved.get(lot.id) ?? 0);
    if (available <= 0) continue;
    const take = Math.min(available, need);
    draws.push({
      stockId: lot.id,
      qty: take,
      unitCost: lot.unit_cost == null ? null : Number(lot.unit_cost),
      acquiredAt: lot.acquired_at,
      poNumber: lot.po_number ?? null,
      serialNumber: lot.serial_number ?? null,
      location: lot.location ?? null,
    });
    need -= take;
  }
  return { draws, shortfall: need };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function drawnQty(draws: { qty: number }[] | undefined | null): number {
  return (draws ?? []).reduce((s, d) => s + Number(d.qty), 0);
}

/** Exact cost of the drawn units: Σ qty × that lot's cost. Null if any cost is hidden. */
export function drawsCost(draws: { qty: number; unitCost: number | null }[] | undefined | null): number | null {
  let total = 0;
  for (const d of draws ?? []) {
    if (d.unitCost == null) return null;
    total += Number(d.qty) * Number(d.unitCost);
  }
  return round2(total);
}

/**
 * The line's unit cost from its draws, plus — for any units no stock covers — the
 * catalog estimate. Returns the exact blended per-unit figure (the line's cost is
 * qty × this, = Σ draws + shortfall × estimate) and what the figure is made of.
 */
export function costFromDraws(input: {
  qty: number;
  draws: StockDraw[];
  catalogCost: number | null;
}): { unitCost: number; costSource: CostSource } {
  const qty = Math.max(0, Math.trunc(input.qty));
  const covered = drawnQty(input.draws);
  const stockCost = drawsCost(input.draws) ?? 0;
  const short = Math.max(0, qty - covered);
  const estimate = Number(input.catalogCost ?? 0);
  if (qty === 0) return { unitCost: input.draws[0]?.unitCost ?? estimate, costSource: covered > 0 ? "stock" : "catalog_estimate" };
  const total = stockCost + short * estimate;
  const costSource: CostSource = covered === 0 ? "catalog_estimate" : short > 0 ? "partial_estimate" : "stock";
  // Not rounded per unit: qty × unitCost must reproduce the exact Σ of the draws.
  return { unitCost: total / qty, costSource };
}

/** "10 × $80.00 (PO 1042, 3 Oct) + 5 × $95.00 (PO 1077)" — for the line + commit dialog. */
export function describeDraws(
  draws: StockDraw[],
  fmt: (n: number) => string
): string {
  return draws
    .map((d) => {
      const bits = [d.poNumber ? `PO ${d.poNumber}` : null, d.acquiredAt ? d.acquiredAt.slice(0, 10) : null, d.serialNumber ? `SN ${d.serialNumber}` : null]
        .filter(Boolean)
        .join(", ");
      return `${d.qty} × ${d.unitCost == null ? "—" : fmt(d.unitCost)}${bits ? ` (${bits})` : ""}`;
    })
    .join(" + ");
}

/** Uncommitted draws still to consume (a partial earlier commit isn't repeated). */
export function remainingDraws(draws: StockDraw[] | undefined, committed: CommittedDraw[] | undefined): StockDraw[] {
  const done = new Map<string, number>();
  for (const c of committed ?? []) done.set(c.sourceStockId, (done.get(c.sourceStockId) ?? 0) + c.qty);
  const out: StockDraw[] = [];
  for (const d of draws ?? []) {
    const already = done.get(d.stockId) ?? 0;
    const left = d.qty - already;
    if (already > 0) done.set(d.stockId, Math.max(0, already - d.qty));
    if (left > 0) out.push({ ...d, qty: left });
  }
  return out;
}

/** What a (possibly legacy) quote line's cost is, for the label. Never recomputes. */
export function lineCostSource(item: {
  type?: string;
  productId?: string;
  costSource?: CostSource;
  stockUnitId?: string;
  stockDraws?: StockDraw[];
}): CostSource | null {
  if (item.type !== "product" || !item.productId) return null;
  if (item.costSource) return item.costSource;
  // Legacy lines (before INV-FIX-1): a pin meant stock cost, no pin meant the
  // catalog default — label them truthfully without changing their figure.
  if (item.stockUnitId || (item.stockDraws && item.stockDraws.length > 0)) return "stock";
  return "catalog_estimate";
}

export const COST_SOURCE_LABEL: Record<CostSource, string> = {
  stock: "From stock",
  partial_estimate: "Partly estimated",
  catalog_estimate: "Estimate — not from stock",
  manual: "Manual cost",
};
