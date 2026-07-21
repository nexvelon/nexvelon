// FIN-6 — the aging vocabulary shared by AR (FIN-3) and AP (FIN-6).
//
// Extracted from lib/api/ar-aging.ts unchanged when the payables mirror landed:
// the bucket boundaries, labels and accumulation are genuinely one concept, and
// two copies would drift the first time someone re-cut the ranges on one side.
// Client-safe (no server imports) so UI can label buckets without a round-trip.

export type AgingBucket = "current" | "1_30" | "31_60" | "61_90" | "90_plus";

export const AGING_BUCKET_LABEL: Record<AgingBucket, string> = {
  current: "Current",
  "1_30": "1–30",
  "31_60": "31–60",
  "61_90": "61–90",
  "90_plus": "90+",
};

/** Parse a yyyy-mm-dd date column into a UTC epoch (DST-proof day math). */
export function isoToUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

/**
 * Whole days between two yyyy-mm-dd dates. Positive when `to` is later.
 * Both AR and AP measure "days past due" as daysBetween(reference, today).
 */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.floor((isoToUtc(toIso) - isoToUtc(fromIso)) / 86_400_000);
}

/**
 * Bucket by days past due. `current` covers everything not yet due (days <= 0);
 * the rest are inclusive day ranges: 1–30, 31–60, 61–90, then 90+.
 */
export function agingBucket(days: number): AgingBucket {
  if (days <= 0) return "current";
  if (days <= 30) return "1_30";
  if (days <= 60) return "31_60";
  if (days <= 90) return "61_90";
  return "90_plus";
}

export interface AgingBuckets {
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
}

export function emptyBuckets(): AgingBuckets {
  return { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
}

const BUCKET_FIELD: Record<AgingBucket, keyof AgingBuckets> = {
  current: "current",
  "1_30": "d1_30",
  "31_60": "d31_60",
  "61_90": "d61_90",
  "90_plus": "d90_plus",
};

export function addToBucket(
  b: AgingBuckets,
  bucket: AgingBucket,
  amount: number
): void {
  const field = BUCKET_FIELD[bucket];
  b[field] = Math.round((b[field] + amount) * 100) / 100;
}

/** Σ of every bucket except `current` — the past-due slice. */
export function overdueOf(b: AgingBuckets): number {
  return Math.round((b.d1_30 + b.d31_60 + b.d61_90 + b.d90_plus) * 100) / 100;
}

/** RFC-4180 field: quote when it contains a comma, quote, CR or LF. */
export function csvField(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
