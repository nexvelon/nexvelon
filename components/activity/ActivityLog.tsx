"use client";

// ACT-1 — display component for the activity_log. Renders the entries
// fetched by listActivityFor() on the server side, latest-on-top.
//
// Click an `update` entry to expand its from→to diff. `create` and
// `delete` entries have no expandable detail (empty `changes`).
//
// Field names are humanized snake_case → Title Case at render time so the diff
// reads naturally. Values are formatted for display by formatActivityValue
// (lib/audit/format-activity-value.ts) — arrays show their real joined values,
// objects show a meaningful label, dates/booleans/empties render explicitly, and
// a bare count is never shown (AUDIT-FIX-2).

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import type {
  ActivityAction,
  DbActivityLogWithActor,
} from "@/lib/types/database";
import {
  formatActivityValue,
  humanizeField,
} from "@/lib/audit/format-activity-value";

interface Props {
  entries: DbActivityLogWithActor[];
}

export function ActivityLog({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <div
        className="rounded-md border p-6 text-center"
        style={{ borderColor: "var(--brand-border)" }}
      >
        <p className="text-muted-foreground text-sm">No activity recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <ActivityEntry key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

function ActivityEntry({ entry }: { entry: DbActivityLogWithActor }) {
  const [expanded, setExpanded] = useState(false);

  const actorName = entry.actor
    ? entry.actor.display_name ||
      [entry.actor.first_name, entry.actor.last_name]
        .filter(Boolean)
        .join(" ") ||
      "Unknown user"
    : "Unknown user";

  const changeKeys = Object.keys(entry.changes);
  const changeCount = changeKeys.length;
  // AUD-1 — a child event that rolled up to this timeline (e.g. a document on a
  // client) reads "added a document — <name>", not "created this record".
  const description = entry.parent_type
    ? describeChild(entry.action, entry.entity_type, entry.entity_label)
    : describeAction(entry.action, changeCount, changeKeys);
  const timestamp = format(
    parseISO(entry.created_at),
    "MMM d, yyyy 'at' h:mm a"
  );
  const hasExpandable = entry.action === "update" && changeCount > 0;

  return (
    <div
      className="rounded-md border p-3"
      style={{ borderColor: "var(--brand-border)" }}
    >
      <button
        type="button"
        onClick={() => hasExpandable && setExpanded((e) => !e)}
        className="flex w-full items-start gap-2 text-left disabled:cursor-default"
        disabled={!hasExpandable}
      >
        <span
          className="text-muted-foreground mt-0.5"
          style={{ visibility: hasExpandable ? "visible" : "hidden" }}
          aria-hidden="true"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="font-medium">{actorName}</span>{" "}
            <span className="text-muted-foreground">{description}</span>
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">{timestamp}</p>
        </div>
      </button>

      {hasExpandable && expanded && (
        <div
          className="mt-3 space-y-1.5 border-t pt-2 pl-6"
          style={{ borderColor: "var(--brand-border)" }}
        >
          {Object.entries(entry.changes).map(([field, change]) => (
            <div key={field} className="text-xs">
              <span className="font-medium">{humanizeField(field)}:</span>{" "}
              <span className="text-muted-foreground line-through">
                {formatActivityValue(change.from)}
              </span>{" "}
              {"→"}{" "}
              <span>{formatActivityValue(change.to)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** AUD-1 — a rolled-up child event, e.g. "added a document — Site survey.pdf". */
function describeChild(
  action: ActivityAction,
  entityType: string,
  label: string | null
): string {
  const verb = action === "create" ? "added" : action === "delete" ? "removed" : "updated";
  const noun = ENTITY_NOUNS[entityType] ?? humanizeField(entityType).toLowerCase();
  return `${verb} a ${noun}${label ? ` — ${label}` : ""}`;
}

const ENTITY_NOUNS: Record<string, string> = {
  attachment: "document",
  contact: "contact",
  site: "site",
  pickup_slip: "pickup slip",
  purchase_order: "purchase order",
  // AUD-2B — child entities that roll up to a project / job / subcontractor.
  job: "job",
  job_task: "task",
  deficiency: "deficiency",
  commissioning_item: "commissioning item",
  stock_movement: "stock movement",
  subcontractor: "subcontractor",
  subcontractor_compliance: "compliance document",
};

function describeAction(
  action: ActivityAction,
  count: number,
  keys: string[]
): string {
  if (action === "create") return "created this record";
  if (action === "delete") return "deleted this record";
  // update
  if (count === 0) return "updated this record";
  if (count === 1) return `updated 1 field: ${humanizeField(keys[0])}`;
  if (count <= 3) {
    const fields = keys.map(humanizeField).join(", ");
    return `updated ${count} fields: ${fields}`;
  }
  return `updated ${count} fields`;
}


