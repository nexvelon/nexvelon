"use client";

// UIDG-9 — the per-widget chrome shown in normal (non-edit) use: a thin utility
// strip above each widget with a last-updated stamp, refresh, expand and an
// overflow menu. Registry-driven (reads WIDGET_META[id].chrome) so the grid never
// special-cases a widget. Refresh remounts just this widget (key bump) → it
// refetches its own data and shows its own loading/error state; a stale-after-
// failure state can't happen because the widget owns those states. In edit mode
// this chrome is NOT rendered (the drag/resize/remove affordances take over).

import { useEffect, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { Maximize2, MoreHorizontal, RefreshCw, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WIDGET_COMPONENTS } from "./widget-registry";
import { WIDGET_META, type WidgetId } from "@/lib/dashboard/widgets";

export function WidgetFrame({
  id,
  onRemove,
}: {
  id: WidgetId;
  onRemove: (id: WidgetId) => void;
}) {
  const meta = WIDGET_META[id];
  const Component = WIDGET_COMPONENTS[id];

  const [nonce, setNonce] = useState(0);
  const [fetchedAt, setFetchedAt] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // Re-render the "updated Xm ago" label periodically so it stays honest.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  function refresh() {
    setRefreshing(true);
    setNonce((n) => n + 1); // remount → the widget refetches
    setFetchedAt(new Date());
    setTimeout(() => setRefreshing(false), 700);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="text-muted-foreground mb-1 flex items-center justify-end gap-1 text-[11px]">
        <span className="mr-auto hidden sm:inline" aria-hidden>
          Updated {formatDistanceToNowStrict(fetchedAt, { addSuffix: true })}
        </span>
        {meta.chrome.refresh && (
          <button
            type="button"
            className="hover:text-brand-navy rounded p-1 disabled:opacity-50"
            aria-label={`Refresh ${meta.title}`}
            onClick={refresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        )}
        {meta.chrome.expand && (
          <button
            type="button"
            className="hover:text-brand-navy rounded p-1"
            aria-label={`Expand ${meta.title}`}
            onClick={() => setExpanded(true)}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="hover:text-brand-navy rounded p-1"
            aria-label={`${meta.title} options`}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setExpanded(true)}>Expand</DropdownMenuItem>
            <DropdownMenuItem onClick={refresh}>Refresh</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => onRemove(id)}>
              Remove from dashboard
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div key={nonce} className="min-h-0 flex-1">
        <Component />
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-h-[90vh] w-[92vw] max-w-5xl overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between font-serif">
              {meta.title}
            </DialogTitle>
          </DialogHeader>
          {/* Fresh instance so the expanded view loads its own data. Escape and
              the dialog's close button both dismiss (Base UI dialog). */}
          <Component />
          <button
            type="button"
            className="text-muted-foreground hover:text-brand-navy absolute right-4 top-4 rounded p-1"
            aria-label="Close"
            onClick={() => setExpanded(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
