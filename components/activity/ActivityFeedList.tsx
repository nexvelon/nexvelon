"use client";

// AUD-3 — the row renderer for the central Activity feed and the per-user view.
// Each row: actor · action · entity type · label (linked when the record still
// exists, plain text + "deleted" when it's gone) · parent context · timestamp,
// with an expandable before→after diff for updates (shared formatter, not forked).

import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { DbActivityLogWithActor } from "@/lib/types/database";
import { ENTITY_TYPE_LABEL, feedHref } from "@/lib/activity-access";
import {
  formatActivityValue,
  humanizeField,
} from "@/lib/audit/format-activity-value";

const VERB: Record<string, string> = {
  create: "created",
  update: "updated",
  delete: "deleted",
};

interface Props {
  entries: DbActivityLogWithActor[];
  /** `${entity_type}:${entity_id}` keys whose record still exists (linkable). */
  liveKeys: Set<string>;
  /** Given a row's actor id, return an href to that actor's activity view, or
   *  null to render the actor name as plain text (no monitoring access). */
  linkActorHref?: (actorId: string | null) => string | null;
}

export function ActivityFeedList({ entries, liveKeys, linkActorHref }: Props) {
  return (
    <div className="space-y-2">
      {entries.map((e) => (
        <FeedRow key={e.id} entry={e} liveKeys={liveKeys} linkActorHref={linkActorHref} />
      ))}
    </div>
  );
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

function FeedRow({
  entry,
  liveKeys,
  linkActorHref,
}: {
  entry: DbActivityLogWithActor;
  liveKeys: Set<string>;
  linkActorHref?: (actorId: string | null) => string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const changeKeys = Object.keys(entry.changes);
  const hasExpandable = entry.action === "update" && changeKeys.length > 0;

  const typeLabel = ENTITY_TYPE_LABEL[entry.entity_type] ?? entry.entity_type;
  const label = entry.entity_label ?? "(unnamed)";
  const href = feedHref(entry.entity_type, entry.entity_id, entry.parent_id);
  const isLive = href ? liveKeys.has(`${entry.entity_type}:${entry.entity_id}`) : false;
  const timestamp = format(parseISO(entry.created_at), "MMM d, yyyy 'at' h:mm a");

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
            {(() => {
              const actorHref = linkActorHref?.(entry.actor_id) ?? null;
              return actorHref ? (
                <Link
                  href={actorHref}
                  className="text-brand-navy font-medium hover:underline"
                  onClick={(ev) => ev.stopPropagation()}
                >
                  {actorName(entry)}
                </Link>
              ) : (
                <span className="font-medium">{actorName(entry)}</span>
              );
            })()}{" "}
            <span className="text-muted-foreground">
              {VERB[entry.action] ?? entry.action} a{" "}
            </span>
            <span className="text-brand-navy font-medium">{typeLabel}</span>
            <span className="text-muted-foreground"> — </span>
            {isLive && href ? (
              <Link
                href={href}
                className="text-brand-navy underline decoration-brand-gold/40 underline-offset-2 hover:decoration-brand-gold"
                onClick={(ev) => ev.stopPropagation()}
              >
                {label}
              </Link>
            ) : (
              <span className="text-brand-charcoal">{label}</span>
            )}
            {href && !isLive && (
              <span
                className="ml-2 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{
                  background: "color-mix(in oklab, var(--destructive) 12%, transparent)",
                  color: "var(--destructive)",
                }}
              >
                deleted
              </span>
            )}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {entry.parent_label ? `in ${entry.parent_label} · ` : ""}
            {timestamp}
          </p>
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
              {"→"} <span>{formatActivityValue(change.to)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
