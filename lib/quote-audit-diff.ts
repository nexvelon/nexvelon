// AUDIT-2 — pure old-vs-new diff for the quote audit trail. Produces a compact,
// structured changes array (scalars + line items + sections + schedules, by id:
// added / removed / edited / moved). Terms are flagged as changed WITHOUT the
// full text (large; the Modified Terms panel shows the actual diff). Status is
// excluded — it has its own status_changed event.

import type { BuilderLineItem, Quote, QuoteSection } from "@/lib/types";
import type { QuoteScheduleInstance } from "@/lib/quote-schedules";

export type QuoteDiffChange =
  | { field: string; from: unknown; to: unknown }
  | { field: "terms"; changed: true }
  | { type: string; label: string }
  | { type: string; label: string; fields: string[] }
  | { type: string; label: string; from: number; to: number };

// Tracked scalar fields (status excluded — own event; terms handled separately).
const SCALAR_FIELDS: (keyof Quote)[] = [
  "name",
  "preparedBy",
  "discount",
  "discountType",
  "templateSlug",
  "themeSlug",
  "taxRate",
  "paymentTerms",
  "showUnitPrice",
  "showVendor",
  "showSku",
  "showUpc",
  "showMasterPart",
  "showName",
  "showDescription",
];

function jsonEq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function shallowChangedKeys(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  exclude: string[]
): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: string[] = [];
  for (const k of keys) {
    if (exclude.includes(k)) continue;
    if (!jsonEq(a[k], b[k])) out.push(k);
  }
  return out;
}

// LCS-based "moved" detection over the ids present in BOTH old and new — so an
// insert/remove doesn't falsely mark the items it shifted as moved. Only ids
// NOT on the longest common subsequence are reported as moved.
function movedIds(
  oldOrder: string[],
  newOrder: string[]
): Map<string, { from: number; to: number }> {
  const newSet = new Set(newOrder);
  const oldC = oldOrder.filter((id) => newSet.has(id));
  const oldSet = new Set(oldC);
  const newC = newOrder.filter((id) => oldSet.has(id));
  const m = oldC.length;
  const n = newC.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0)
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        oldC[i] === newC[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const lcs = new Set<string>();
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (oldC[i] === newC[j]) {
      lcs.add(oldC[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  const oldRank = new Map(oldC.map((id, idx) => [id, idx] as const));
  const newRank = new Map(newC.map((id, idx) => [id, idx] as const));
  const moved = new Map<string, { from: number; to: number }>();
  for (const id of oldSet) {
    if (!lcs.has(id)) {
      moved.set(id, { from: oldRank.get(id) ?? -1, to: newRank.get(id) ?? -1 });
    }
  }
  return moved;
}

function diffCollection<T extends { id: string }>(
  oldArr: T[],
  newArr: T[],
  prefix: "line" | "section" | "schedule",
  label: (t: T) => string,
  editExclude: string[]
): QuoteDiffChange[] {
  const out: QuoteDiffChange[] = [];
  const oldById = new Map(oldArr.map((t) => [t.id, t]));
  const newById = new Map(newArr.map((t) => [t.id, t]));

  for (const t of newArr) {
    if (!oldById.has(t.id)) out.push({ type: `${prefix}_added`, label: label(t) });
  }
  for (const t of oldArr) {
    if (!newById.has(t.id))
      out.push({ type: `${prefix}_removed`, label: label(t) });
  }
  for (const t of newArr) {
    const o = oldById.get(t.id);
    if (!o) continue;
    const fields = shallowChangedKeys(
      o as Record<string, unknown>,
      t as Record<string, unknown>,
      ["id", ...editExclude]
    );
    if (fields.length)
      out.push({ type: `${prefix}_edited`, label: label(t), fields });
  }
  const moved = movedIds(
    oldArr.map((t) => t.id),
    newArr.map((t) => t.id)
  );
  for (const [id, pos] of moved) {
    const t = newById.get(id);
    if (t) out.push({ type: `${prefix}_moved`, label: label(t), ...pos });
  }
  return out;
}

const lineLabel = (li: BuilderLineItem): string =>
  li.name || li.sku || li.description || "line";
const sectionLabel = (s: QuoteSection): string => s.name || "section";
const scheduleLabel = (s: QuoteScheduleInstance): string =>
  s.title || s.kind || "schedule";

/**
 * Compute the structured content diff between two quote versions. Empty array =
 * no tracked content change (the save was status-only or a no-op).
 */
export function diffQuote(oldQ: Quote, newQ: Quote): QuoteDiffChange[] {
  const changes: QuoteDiffChange[] = [];

  for (const f of SCALAR_FIELDS) {
    if (!jsonEq(oldQ[f], newQ[f])) {
      changes.push({ field: f as string, from: oldQ[f] ?? null, to: newQ[f] ?? null });
    }
  }
  // Terms: record only that it changed — never the full text.
  if ((oldQ.terms ?? "") !== (newQ.terms ?? "")) {
    changes.push({ field: "terms", changed: true });
  }

  // Line items, flattened across sections (id-keyed; a line can move sections).
  const oldLines = (oldQ.sections ?? []).flatMap((s) => s.items);
  const newLines = (newQ.sections ?? []).flatMap((s) => s.items);
  changes.push(...diffCollection(oldLines, newLines, "line", lineLabel, []));

  // Sections (items handled above as line diffs).
  changes.push(
    ...diffCollection(
      oldQ.sections ?? [],
      newQ.sections ?? [],
      "section",
      sectionLabel,
      ["items"]
    )
  );

  // Schedules.
  changes.push(
    ...diffCollection(
      oldQ.schedules ?? [],
      newQ.schedules ?? [],
      "schedule",
      scheduleLabel,
      []
    )
  );

  return changes;
}
