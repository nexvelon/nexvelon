"use client";

// ACT-1 — display component for the activity_log. Renders the entries
// fetched by listActivityFor() on the server side, latest-on-top.
//
// Click an `update` entry to expand its from→to diff. `create` and
// `delete` entries have no expandable detail (empty `changes`).
//
// Field names are humanized snake_case → Title Case at render time so
// the diff reads naturally. Values are formatted for display: NULL →
// "(empty)", booleans → Yes/No, arrays → "[N items]", objects → JSON.

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import type {
  ActivityAction,
  DbActivityLogWithActor,
} from "@/lib/types/database";

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
        <p className="text-muted-foreground text-sm">No activity yet.</p>
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
  const description = describeAction(entry.action, changeCount, changeKeys);
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
                {formatValue(change.from)}
              </span>{" "}
              {"→"}{" "}
              <span>{formatValue(change.to)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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

/** snake_case → Title Case. "billing_postal" → "Billing Postal". */
function humanizeField(field: string): string {
  return field
    .split("_")
    .map((w) => (w.length === 0 ? "" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/**
 * Render an arbitrary JSON value compactly for the diff line. NULL →
 * "(empty)", booleans → Yes/No, arrays → "[N items]", objects → JSON
 * blob (rarely hit — our jsonb fields are arrays of phones today).
 */
function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "(empty)";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v))
    return `[${v.length} item${v.length === 1 ? "" : "s"}]`;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

