"use client";

// AUDIT-1 — admin-only History panel for the quote builder. Lists
// quote_audit_log events chronologically (oldest first) with a second-precision
// Toronto timestamp, the actor, and a human description.
//
// POLISH-3 — Admins can HARD-delete a single audit row or the whole trail for a
// quote (type-to-confirm with the quote id). Deletes are irreversible and are
// not themselves audited. Paginated via the shared Paginator.

import { useCallback, useEffect, useState, useTransition } from "react";
import { History, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Paginator,
  usePersistedPageSize,
} from "@/components/modules/shared/Paginator";
import { useRole } from "@/lib/role-context";
import { BUSINESS_TIMEZONE } from "@/lib/format";
import type { DbQuoteAuditLog } from "@/lib/types/database";
import type { QuoteDiffChange } from "@/lib/quote-audit-diff";
import {
  getQuoteAuditEventsAction,
  deleteQuoteAuditByIdAction,
  deleteAllQuoteAuditForQuoteAction,
} from "@/app/(app)/quotes/actions";

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

  const [pageSize, setPageSize] = usePersistedPageSize(
    "nexvelon:quote-history:pageSize",
    10
  );
  const [page, setPage] = useState(0);

  const [pending, startTransition] = useTransition();
  const [confirmRow, setConfirmRow] = useState<DbQuoteAuditLog | null>(null);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeInput, setWipeInput] = useState("");

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

  function deleteRow(ev: DbQuoteAuditLog) {
    startTransition(async () => {
      const res = await deleteQuoteAuditByIdAction(ev.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setConfirmRow(null);
      toast.success("History event deleted");
      load();
    });
  }

  function wipeAll() {
    startTransition(async () => {
      const res = await deleteAllQuoteAuditForQuoteAction(quoteId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setWipeOpen(false);
      setWipeInput("");
      setPage(0);
      toast.success(`Deleted ${res.data.deleted} history event(s)`);
      load();
    });
  }

  if (role !== "Admin") return null;

  const pageCount = Math.max(1, Math.ceil(events.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageEvents = events.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize
  );

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
            <div className="flex items-center gap-1">
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
              {events.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setWipeInput("");
                    setWipeOpen(true);
                  }}
                  disabled={pending}
                  className="h-7 gap-1 px-2 text-xs text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete all
                </Button>
              )}
            </div>
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
            <>
              <ol className="space-y-2">
                {pageEvents.map((ev) => (
                  <li
                    key={ev.id}
                    className="group flex items-start justify-between gap-2 border-l-2 border-[var(--border)] pl-3 text-xs"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-brand-charcoal font-medium">
                        {describe(ev)}
                      </span>
                      <span className="text-muted-foreground text-[11px]">
                        {TS_FMT.format(new Date(ev.created_at))}
                        {ev.actor_name ? ` · ${ev.actor_name}` : ""}
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1 text-red-600 hover:text-red-700"
                      onClick={() => setConfirmRow(ev)}
                      disabled={pending}
                      aria-label="Delete history event"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ol>
              {events.length > pageSize && (
                <div className="mt-3 -mx-4 -mb-4">
                  <Paginator
                    totalItems={events.length}
                    page={safePage}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={(n) => {
                      setPageSize(n);
                      setPage(0);
                    }}
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      )}

      {/* Per-row delete confirm */}
      <Dialog
        open={confirmRow !== null}
        onOpenChange={(o) => !o && setConfirmRow(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this history event?</DialogTitle>
            <DialogDescription>
              This permanently removes one event from the quote&rsquo;s history.
              It cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmRow(null)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => confirmRow && deleteRow(confirmRow)}
              disabled={pending}
            >
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Wipe-all type-to-confirm (type the quote id) */}
      <Dialog
        open={wipeOpen}
        onOpenChange={(o) => {
          if (!o) {
            setWipeOpen(false);
            setWipeInput("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete all history for this quote?</DialogTitle>
            <DialogDescription>
              This permanently deletes every history event for this quote. It
              cannot be undone. Type the quote id{" "}
              <span className="text-brand-charcoal font-mono font-semibold break-all">
                {quoteId}
              </span>{" "}
              to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={wipeInput}
            onChange={(e) => setWipeInput(e.target.value)}
            placeholder={quoteId}
            disabled={pending}
            className="font-mono"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setWipeOpen(false);
                setWipeInput("");
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={wipeAll}
              disabled={pending || wipeInput !== quoteId}
            >
              {pending ? "Deleting…" : "Delete all"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
