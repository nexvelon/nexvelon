"use server";

// AUD-3 — server actions for the central Activity feed + its CSV export. Both go
// through listActivityFeed with the caller's role, so a row for a record the
// caller cannot view is never returned OR exported (the one leakage guard). The
// module is openable by any authenticated user; the row-scope does the filtering
// (approach (i)). The per-user monitoring view is gated separately (see
// user-actions.ts).

import { getCurrentProfile } from "@/lib/auth/profile";
import { adaptDbRole } from "@/lib/permissions/resolve";
import {
  listActivityFeed,
  liveRecordKeys,
  type ActivityFeed,
} from "@/lib/api/activity-log";
import { ACTIVITY_PAGE_SIZE, ENTITY_TYPE_LABEL } from "@/lib/activity-access";
import { exportDataset, type ReportExport } from "@/lib/reports/export";
import type { ReportDataset } from "@/lib/reports/dataset";
import { formatActivityValue, humanizeField } from "@/lib/audit/format-activity-value";
import { rangeFor, type RangeKey } from "@/lib/date-range";
import { format, parseISO } from "date-fns";
import type {
  ActivityAction,
  ActivityEntityType,
  DbActivityLogWithActor,
} from "@/lib/types/database";

// Hard ceiling on a single export so a wide range can't pull an unbounded set.
const EXPORT_CAP = 10_000;

export interface ActivityFeedInput {
  actorId?: string | null;
  entityTypes?: ActivityEntityType[];
  action?: ActivityAction | null;
  /** Preset range key; ignored when `from`/`to` are supplied. Defaults to MTD. */
  range?: RangeKey;
  from?: string;
  to?: string;
  q?: string;
  offset?: number;
}

export interface ActivityFeedPage extends ActivityFeed {
  /** `${entity_type}:${entity_id}` keys whose record still exists (linkable). */
  liveKeys: string[];
}

export type FeedResult =
  | { ok: true; page: ActivityFeedPage }
  | { ok: false; error: string };

export type FeedExportResult =
  | { ok: true; export: ReportExport; truncated: boolean }
  | { ok: false; error: string };

/** Resolve the [from,to] ISO window from either explicit dates or a preset key
 *  (default MTD) — the feed is never unbounded. */
function resolveWindow(input: ActivityFeedInput): { from: string; to: string } {
  if (input.from && input.to) return { from: input.from, to: input.to };
  const r = rangeFor(input.range ?? "mtd");
  return { from: r.start.toISOString(), to: r.end.toISOString() };
}

export async function loadActivityFeedAction(
  input: ActivityFeedInput
): Promise<FeedResult> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "You must be signed in to view activity." };
  const role = adaptDbRole(me.role);
  const { from, to } = resolveWindow(input);
  try {
    const page = await listActivityFeed(role, {
      actorId: input.actorId ?? null,
      entityTypes: input.entityTypes,
      action: input.action ?? null,
      from,
      to,
      q: input.q,
      limit: ACTIVITY_PAGE_SIZE,
      offset: input.offset ?? 0,
    });
    const liveKeys = [...(await liveRecordKeys(page.entries))];
    return { ok: true, page: { ...page, liveKeys } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to load activity." };
  }
}

/** A compact one-line summary of a row's field changes, for the export column. */
function summarizeChanges(entry: DbActivityLogWithActor): string {
  const keys = Object.keys(entry.changes);
  if (keys.length === 0) return "";
  return keys
    .map((k) => {
      const c = entry.changes[k];
      return `${humanizeField(k)}: ${formatActivityValue(c.from)} → ${formatActivityValue(c.to)}`;
    })
    .join("; ");
}

function actorName(entry: DbActivityLogWithActor): string {
  const a = entry.actor;
  if (!a) return "Unknown user";
  return (
    a.display_name ||
    [a.first_name, a.last_name].filter(Boolean).join(" ") ||
    "Unknown user"
  );
}

export async function exportActivityFeedAction(
  input: ActivityFeedInput
): Promise<FeedExportResult> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "You must be signed in to export activity." };
  const role = adaptDbRole(me.role);
  const { from, to } = resolveWindow(input);
  try {
    // Same filters + same role scope as the view — pull up to the cap in one shot.
    const { entries, hasMore } = await listActivityFeed(role, {
      actorId: input.actorId ?? null,
      entityTypes: input.entityTypes,
      action: input.action ?? null,
      from,
      to,
      q: input.q,
      limit: EXPORT_CAP,
      offset: 0,
    });
    const dataset: ReportDataset = {
      title: "Activity",
      subtitle: `${format(parseISO(from), "d MMM yyyy")} – ${format(parseISO(to), "d MMM yyyy")}`,
      columns: [
        { key: "when", label: "When", kind: "text" },
        { key: "actor", label: "Actor", kind: "text" },
        { key: "action", label: "Action", kind: "text" },
        { key: "type", label: "Type", kind: "text" },
        { key: "record", label: "Record", kind: "text" },
        { key: "parent", label: "Parent", kind: "text" },
        { key: "changes", label: "Changes", kind: "text" },
      ],
      rows: entries.map((e) => ({
        when: format(parseISO(e.created_at), "yyyy-MM-dd HH:mm"),
        actor: actorName(e),
        action: e.action,
        type: ENTITY_TYPE_LABEL[e.entity_type] ?? e.entity_type,
        record: e.entity_label ?? "",
        parent: e.parent_label ?? "",
        changes: summarizeChanges(e),
      })),
      filename: `activity-${from.slice(0, 10)}-to-${to.slice(0, 10)}`,
    };
    return { ok: true, export: await exportDataset(dataset, "csv"), truncated: hasMore };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to export activity." };
  }
}
