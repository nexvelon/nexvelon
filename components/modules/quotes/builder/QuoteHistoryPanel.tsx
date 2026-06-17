"use client";

// AUDIT-1 — admin-only, read-only History panel for the quote builder. Lists
// quote_audit_log events chronologically (oldest first) with a second-precision
// Toronto timestamp, the actor, and a human description. No edit/delete
// affordances — the underlying table is immutable.

import { useCallback, useEffect, useState } from "react";
import { History, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRole } from "@/lib/role-context";
import { BUSINESS_TIMEZONE } from "@/lib/format";
import type { DbQuoteAuditLog } from "@/lib/types/database";
import type { QuoteDiffChange } from "@/lib/quote-audit-diff";
import { getQuoteAuditEventsAction } from "@/app/(app)/quotes/actions";

const TS_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

type AuditChanges = {
  status?: { from: string | null; to: string };
  rejectionReason?: string | null;
  rejectionSource?: string | null;
  closingReason?: string | null;
  items?: QuoteDiffChange[];
};

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "on" : "off";
  return String(v);
}

// AUDIT-2 — one content change → a short phrase.
function describeChange(c: QuoteDiffChange): string {
  if ("field" in c) {
    if (c.field === "terms") return "terms edited";
    const fc = c as { field: string; from: unknown; to: unknown };
    return `${fc.field}: '${fmtVal(fc.from)}' → '${fmtVal(fc.to)}'`;
  }
  const [noun, verb] = c.type.split("_"); // e.g. "line","added"
  const label = `'${c.label}'`;
  if (verb === "added") return `added ${noun} ${label}`;
  if (verb === "removed") return `removed ${noun} ${label}`;
  if (verb === "moved") return `moved ${noun} ${label}`;
  if (verb === "edited") return `edited ${noun} ${label}`;
  return `${c.type} ${label}`;
}

function describe(ev: DbQuoteAuditLog): string {
  const c = (ev.changes ?? {}) as AuditChanges;
  if (ev.event_type === "created") return "Created";
  if (ev.event_type === "status_changed") {
    const to = c.status?.to;
    const from = c.status?.from ?? "—";
    if (to === "Revision") {
      const src = c.rejectionSource ? ` (${c.rejectionSource})` : "";
      const reason = c.rejectionReason ? `: ${c.rejectionReason}` : "";
      return `Sent for revision${src}${reason}`;
    }
    if (to === "Closed") {
      const reason = c.closingReason ? `: ${c.closingReason}` : "";
      return `Closed${reason}`;
    }
    return `Status: ${from} → ${to ?? "—"}`;
  }
  if (ev.event_type === "updated") {
    const items = c.items ?? [];
    if (items.length === 0) return "Updated";
    return `Updated — ${items.map(describeChange).join("; ")}`;
  }
  return ev.event_type;
}

export function QuoteHistoryPanel({
  quoteId,
  status,
}: {
  quoteId: string;
  // Re-fetch when the quote's status changes (a new audit row was just written
  // server-side). Not otherwise read.
  status: string;
}) {
  const { role } = useRole();
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<DbQuoteAuditLog[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getQuoteAuditEventsAction(quoteId);
    setEvents(res.ok ? res.data : []);
    setLoading(false);
  }, [quoteId]);

  useEffect(() => {
    if (!open) return;
    // Slight delay: the audit row is written async (after the quote upsert
    // resolves), so give it a beat to land after a status change.
    const t = setTimeout(load, 400);
    return () => clearTimeout(t);
  }, [open, status, load]);

  if (role !== "Admin") return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between font-serif text-lg">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-2"
          >
            <History className="h-4 w-4" />
            History
            <span className="text-muted-foreground text-[11px] font-normal">
              {open ? "Hide" : "Show"}
            </span>
          </button>
          {open && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={load}
              disabled={loading}
              className="h-7 gap-1 px-2 text-xs"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent>
          {loading && events.length === 0 ? (
            <p className="text-muted-foreground text-xs">Loading history…</p>
          ) : events.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              No history yet. Events are recorded on create and each status
              change.
            </p>
          ) : (
            <ol className="space-y-2">
              {events.map((ev) => (
                <li
                  key={ev.id}
                  className="flex flex-col gap-0.5 border-l-2 border-[var(--border)] pl-3 text-xs"
                >
                  <span className="text-brand-charcoal font-medium">
                    {describe(ev)}
                  </span>
                  <span className="text-muted-foreground text-[11px]">
                    {TS_FMT.format(new Date(ev.created_at))}
                    {ev.actor_name ? ` · ${ev.actor_name}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      )}
    </Card>
  );
}
