import "server-only";

// SNAP-1 — daily point-in-time BALANCE SNAPSHOTS. Captures what the existing
// balance queries return (no calculation changes) so the AR/AP/WIP/deposits KPIs
// gain deltas + trend lines. The table is the canonical home for point-in-time
// history (see NEXVELON_PRINCIPLES §2.2). Capture runs SERVICE-ROLE (no user
// session); reads run the caller's session client and the DASHBOARD gates which
// metrics a role may read (a user who can't see AR can't see AR history).

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { businessDateISO } from "@/lib/format";
import { getArAgingSummary } from "@/lib/api/ar-aging";
import { getApSummary } from "@/lib/api/vendor-bills";
import { getDepositsHeldTotal } from "@/lib/api/deposits";
import { getWipPortfolio } from "@/lib/api/wip";
import type { Resource, Action } from "@/lib/permissions";
import type { BalanceClient } from "@/lib/api/balance-client";
import type { DbBalanceSnapshot } from "@/lib/types/database";

const MS_DAY = 86_400_000;

export type MetricPolarity = "normal" | "inverted";

export interface BalanceMetric {
  key: string;
  label: string;
  unit: "currency" | "count";
  /** The permission a caller needs to READ this metric's history (same as live). */
  gate: { resource: Resource; action: Action };
  /** When set, the metric shows a good/bad delta of this polarity. Counts omit it. */
  polarity?: MetricPolarity;
}

// The metrics captured this chunk. Row-per-metric storage means adding one later is
// a plain INSERT — no migration (2c). Counts are a future addition (their delta
// isn't clearly good/bad); this chunk captures the point-in-time BALANCES that
// UIDG-6B could not compare (2a).
export const BALANCE_METRICS: BalanceMetric[] = [
  { key: "ar_outstanding", label: "AR outstanding", unit: "currency", gate: { resource: "financials", action: "view" }, polarity: "inverted" },
  { key: "ar_overdue", label: "AR overdue", unit: "currency", gate: { resource: "financials", action: "view" }, polarity: "inverted" },
  { key: "ap_outstanding", label: "AP outstanding", unit: "currency", gate: { resource: "financials", action: "view" }, polarity: "inverted" },
  { key: "ap_overdue", label: "AP overdue", unit: "currency", gate: { resource: "financials", action: "view" }, polarity: "inverted" },
  { key: "deposits_held", label: "Deposits held", unit: "currency", gate: { resource: "financials", action: "view" }, polarity: "normal" },
  { key: "wip_net", label: "WIP net", unit: "currency", gate: { resource: "financials", action: "edit" }, polarity: "normal" },
  { key: "wip_overbilled", label: "WIP overbilled", unit: "currency", gate: { resource: "financials", action: "edit" } },
  { key: "wip_underbilled", label: "WIP underbilled", unit: "currency", gate: { resource: "financials", action: "edit" } },
];

const OPCO_ALL = "all";

// ─── Capture (service-role, idempotent) ──────────────────────────────────────

export interface CaptureResult {
  date: string;
  inserted: number;
  /** Metrics already captured today (a re-run is a no-op — immutable, §2.2). */
  skipped: number;
}

/**
 * Capture today's balances. SERVICE-ROLE — reads every balance with the admin
 * client (an anon read would be RLS-denied and silently return zeros), writes one
 * row per metric with opco 'all', and ON CONFLICT DO NOTHING so a same-day re-run
 * is a no-op. Loud on failure (throws after logging); the caller/endpoint surfaces
 * it. Writes a §5 audit row.
 */
export async function captureBalanceSnapshots(now: Date = new Date()): Promise<CaptureResult> {
  const admin = createAdminClient() as unknown as BalanceClient;
  const date = businessDateISO(now);

  let values: Record<string, number>;
  try {
    const [ar, ap, dep, wip] = await Promise.all([
      getArAgingSummary(admin),
      getApSummary(date, admin),
      getDepositsHeldTotal(admin),
      getWipPortfolio(admin),
    ]);
    values = {
      ar_outstanding: ar.total,
      ar_overdue: ar.overdueTotal,
      ap_outstanding: ap.outstanding,
      ap_overdue: ap.overdue,
      deposits_held: dep,
      wip_net: wip.totals.net,
      wip_overbilled: wip.totals.overbilled,
      wip_underbilled: wip.totals.underbilled,
    };
  } catch (e) {
    console.error(`[balance-snapshots] capture READ failed for ${date}:`, e);
    throw e instanceof Error ? e : new Error(String(e));
  }

  const rows = BALANCE_METRICS.filter((m) => m.key in values).map((m) => ({
    captured_date: date,
    metric_key: m.key,
    opco: OPCO_ALL,
    amount: round2(values[m.key]),
  }));

  const { data, error } = await admin
    .from("balance_snapshots")
    .upsert(rows, { onConflict: "metric_key,opco,captured_date", ignoreDuplicates: true })
    .select("id");
  if (error) {
    console.error(`[balance-snapshots] capture WRITE failed for ${date}: ${error.message}`);
    throw new Error(`captureBalanceSnapshots: ${error.message}`);
  }
  const inserted = data?.length ?? 0;

  // §5 audit — one system row per run (actor null; filtered from the compact feed).
  const { error: auditErr } = await admin.from("activity_log").insert({
    entity_type: "balance_snapshot",
    entity_id: date,
    action: "create",
    changes: { captured: inserted, metrics: rows.length },
    actor_id: null,
    entity_label: `Balance snapshot ${date}`,
  });
  if (auditErr) {
    // Loud but non-fatal — the snapshot rows are the record; the audit is secondary.
    console.error(`[balance-snapshots] audit row failed for ${date}: ${auditErr.message}`);
  }

  return { date, inserted, skipped: rows.length - inserted };
}

/** Whether today's snapshot already exists (drives the lazy first-load capture). */
export async function hasTodaySnapshot(now: Date = new Date()): Promise<boolean> {
  const admin = createAdminClient();
  const date = businessDateISO(now);
  const { count } = await admin
    .from("balance_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("captured_date", date);
  return (count ?? 0) > 0;
}

/**
 * Best-effort lazy capture: if today has no snapshot, capture it. Called from the
 * dashboard load so history builds even before a cron is wired. Never throws to the
 * caller — a failed lazy capture must not break the dashboard (it's logged, and the
 * gap remains visible).
 */
export async function captureIfMissing(now: Date = new Date()): Promise<void> {
  try {
    if (await hasTodaySnapshot(now)) return;
    await captureBalanceSnapshots(now);
  } catch (e) {
    console.error("[balance-snapshots] lazy capture failed:", e);
  }
}

// ─── Reads (session client; caller gates the metrics) ────────────────────────

async function db(): Promise<BalanceClient> {
  return (await createSupabaseServerClient()) as unknown as BalanceClient;
}

export interface MetricHistory {
  key: string;
  /** Ascending by date. */
  points: { date: string; amount: number }[];
  /** The value at (or the nearest snapshot on/before) the comparison anchor, or
   *  null when history doesn't reach back that far (→ "building history"). */
  priorAt: number | null;
}

/**
 * Snapshot history for a set of metrics over [from, to] plus the prior value at a
 * comparison anchor date — one query, opco 'all'. The caller (dashboard action)
 * passes only the metric keys the role may read.
 */
export async function getBalanceHistory(
  metricKeys: string[],
  from: string,
  to: string,
  comparisonAnchor: string | null
): Promise<MetricHistory[]> {
  if (metricKeys.length === 0) return [];
  const supabase = await db();
  const { data, error } = await supabase
    .from("balance_snapshots")
    .select("metric_key, captured_date, amount")
    .eq("opco", OPCO_ALL)
    .in("metric_key", metricKeys)
    .gte("captured_date", from)
    .lte("captured_date", to)
    .order("captured_date", { ascending: true });
  if (error) throw new Error(`getBalanceHistory: ${error.message}`);
  const rows = (data ?? []) as Pick<DbBalanceSnapshot, "metric_key" | "captured_date" | "amount">[];

  const byMetric = new Map<string, { date: string; amount: number }[]>();
  for (const r of rows) {
    const list = byMetric.get(r.metric_key) ?? [];
    list.push({ date: r.captured_date, amount: Number(r.amount) });
    byMetric.set(r.metric_key, list);
  }

  return metricKeys.map((key) => {
    const points = byMetric.get(key) ?? [];
    // Prior = the last snapshot on/before the comparison anchor (nearest-≤).
    let priorAt: number | null = null;
    if (comparisonAnchor) {
      for (const p of points) {
        if (p.date <= comparisonAnchor) priorAt = p.amount;
        else break;
      }
    }
    return { key, points, priorAt };
  });
}

// ─── Gap detection (a missed day must be visible, not smoothed over) ──────────

export interface SnapshotGaps {
  firstDate: string | null;
  lastDate: string | null;
  /** Toronto dates with NO snapshot between first and today (exclusive of today
   *  until it's captured). Empty when continuous. */
  missing: string[];
}

/**
 * Missing capture days between the first snapshot and today. A snapshot system that
 * silently stops looks continuous while lying — this surfaces the gap. Uses one
 * metric's dates as the spine (all metrics capture together).
 */
export async function detectSnapshotGaps(now: Date = new Date()): Promise<SnapshotGaps> {
  const supabase = await db();
  const today = businessDateISO(now);
  const { data, error } = await supabase
    .from("balance_snapshots")
    .select("captured_date")
    .eq("opco", OPCO_ALL)
    .eq("metric_key", BALANCE_METRICS[0].key)
    .order("captured_date", { ascending: true });
  if (error) throw new Error(`detectSnapshotGaps: ${error.message}`);
  const dates = (data ?? []).map((r) => (r as { captured_date: string }).captured_date);
  if (dates.length === 0) return { firstDate: null, lastDate: null, missing: [] };

  const present = new Set(dates);
  const first = dates[0];
  const missing: string[] = [];
  // Walk first…yesterday (today may legitimately not be captured yet).
  for (let d = toDay(first); d < toDay(today); d++) {
    const iso = fromDay(d);
    if (!present.has(iso)) missing.push(iso);
  }
  return { firstDate: first, lastDate: dates[dates.length - 1], missing };
}

// ─── small date helpers (UTC day-number over yyyy-mm-dd) ──────────────────────

function toDay(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / MS_DAY);
}
function fromDay(n: number): string {
  return new Date(n * MS_DAY).toISOString().slice(0, 10);
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
