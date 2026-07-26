import "server-only";

// REP-3 — sales pipeline aggregate. Counts + summed value per quote status, and
// a conversion rate. Pure read over listQuotes (the quote's own status is the
// sales-funnel truth — set to "Converted" by the operator's convert action).
//
// NO fabricated "Lead" stage — the pipeline is exactly the seven real
// QuoteStatus values. Period-aware on the quote's effective date (quoteDate,
// falling back to createdAt).

import { listQuotes } from "@/lib/api/quotes";
import { round2 } from "@/lib/quote-helpers";
import type { QuoteStatus } from "@/lib/types";

// Canonical funnel order — every status always appears, even at zero, so the
// report reads as a full pipeline rather than only the populated stages.
export const PIPELINE_STATUS_ORDER: QuoteStatus[] = [
  "Draft",
  "Sent",
  "Approved",
  "Revision",
  "Converted",
  "Closed",
  "Expired",
];

export interface PipelineStatusRow {
  status: QuoteStatus;
  count: number;
  value: number;
}

export interface SalesPipeline {
  byStatus: PipelineStatusRow[];
  totals: {
    total_count: number;
    total_value: number;
    /**
     * Converted ÷ non-draft. The denominator is every quote that LEFT Draft
     * (i.e. reached a client) — a win rate over quotes actually in play. Null
     * when nothing has left Draft yet. 0..100 scale.
     */
    conversion_rate: number | null;
  };
}

function effectiveDate(q: { quoteDate?: string; createdAt: string }): string {
  return (q.quoteDate ?? q.createdAt ?? "").slice(0, 10);
}

export async function getSalesPipeline(
  range: { from?: string; to?: string } = {}
): Promise<SalesPipeline> {
  const quotes = await listQuotes();

  const inRange = quotes.filter((q) => {
    const d = effectiveDate(q);
    if (!d) return true; // undated legacy quote — don't silently drop it
    if (range.from && d < range.from) return false;
    if (range.to && d > range.to) return false;
    return true;
  });

  const agg = new Map<QuoteStatus, { count: number; value: number }>();
  for (const s of PIPELINE_STATUS_ORDER) agg.set(s, { count: 0, value: 0 });

  let totalCount = 0;
  let totalValue = 0;
  let converted = 0;
  let nonDraft = 0;

  for (const q of inRange) {
    const cur = agg.get(q.status) ?? { count: 0, value: 0 };
    cur.count += 1;
    cur.value = round2(cur.value + Number(q.total ?? 0));
    agg.set(q.status, cur);

    totalCount += 1;
    totalValue = round2(totalValue + Number(q.total ?? 0));
    if (q.status !== "Draft") nonDraft += 1;
    if (q.status === "Converted") converted += 1;
  }

  return {
    byStatus: PIPELINE_STATUS_ORDER.map((status) => ({
      status,
      count: agg.get(status)!.count,
      value: agg.get(status)!.value,
    })),
    totals: {
      total_count: totalCount,
      total_value: totalValue,
      conversion_rate: nonDraft > 0 ? round2((converted / nonDraft) * 100) : null,
    },
  };
}
