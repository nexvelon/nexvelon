import "server-only";

// REP-3 — vendor spend top-N. The all-vendors aggregate that getVendorMetrics
// (per-vendor) never provided: Σ vendor_bills.subtotal grouped by vendor, over a
// period, ordered by spend desc, top N. PRE-TAX subtotal (the same basis as the
// per-vendor YTD spend), void bills excluded.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/quote-helpers";

async function db() {
  return createSupabaseServerClient();
}

export interface VendorSpendRow {
  vendor_id: string;
  vendor: string;
  bill_count: number;
  spend: number;
}

export interface VendorSpendReport {
  rows: VendorSpendRow[];
  total_spend: number;
  /** Vendors beyond the top N, rolled into one line (0 when none dropped). */
  others: { vendor_count: number; spend: number };
  from: string | null;
  to: string | null;
}

export async function getVendorSpendReport(
  opts: { from?: string; to?: string; limit?: number } = {}
): Promise<VendorSpendReport> {
  const supabase = await db();
  const limit = opts.limit ?? 20;

  let q = supabase
    .from("vendor_bills")
    .select("vendor_id, subtotal, bill_date, vendor:vendors(name)")
    .neq("status", "void");
  if (opts.from) q = q.gte("bill_date", opts.from);
  if (opts.to) q = q.lte("bill_date", opts.to);
  const { data, error } = await q;
  if (error) throw new Error(`getVendorSpendReport: ${error.message}`);

  const rows = (data ?? []) as unknown as {
    vendor_id: string;
    subtotal: number | null;
    vendor: { name: string } | null;
  }[];

  const byVendor = new Map<string, VendorSpendRow>();
  let totalSpend = 0;
  for (const r of rows) {
    const amt = round2(Number(r.subtotal ?? 0));
    totalSpend = round2(totalSpend + amt);
    const cur =
      byVendor.get(r.vendor_id) ??
      ({ vendor_id: r.vendor_id, vendor: r.vendor?.name ?? "—", bill_count: 0, spend: 0 } as VendorSpendRow);
    cur.bill_count += 1;
    cur.spend = round2(cur.spend + amt);
    byVendor.set(r.vendor_id, cur);
  }

  const ranked = [...byVendor.values()].sort((a, b) => b.spend - a.spend);
  const top = ranked.slice(0, limit);
  const rest = ranked.slice(limit);
  const others = {
    vendor_count: rest.length,
    spend: round2(rest.reduce((s, r) => s + r.spend, 0)),
  };

  return {
    rows: top,
    total_spend: totalSpend,
    others,
    from: opts.from ?? null,
    to: opts.to ?? null,
  };
}
