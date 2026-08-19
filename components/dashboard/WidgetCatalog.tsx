"use client";

// UIDG-10 — the browsable widget catalog, opened from edit mode. Lists every widget
// the user is PERMITTED to add (unpermitted widgets are absent, never greyed out —
// a financial widget advertised to a Technician would be an information leak),
// grouped by category, each with an icon thumbnail + description. A widget already
// on the dashboard shows as "Added" (the duplicate rule, 2e — no second copy).
// Searchable because the permitted set can exceed ~15 entries. Adding persists
// immediately (the caller's onAdd → the same debounced save the rest of edit mode
// uses) and places the widget at a sensible position (appended, at its default
// size).

import { useMemo, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  WIDGET_META,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  type WidgetId,
  type WidgetCategory,
} from "@/lib/dashboard/widgets";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Every widget this user may see — the permitted pool (already leakage-filtered). */
  visibleWidgetIds: WidgetId[];
  /** Ids currently on the dashboard (shown as "Added", not addable again). */
  placedIds: Set<WidgetId>;
  onAdd: (id: WidgetId) => void;
}

export function WidgetCatalog({ open, onOpenChange, visibleWidgetIds, placedIds, onAdd }: Props) {
  const [query, setQuery] = useState("");

  const showSearch = visibleWidgetIds.length > 15;
  const q = query.trim().toLowerCase();

  const grouped = useMemo(() => {
    const permitted = new Set(visibleWidgetIds);
    const out: { category: WidgetCategory; items: WidgetId[] }[] = [];
    for (const category of CATEGORY_ORDER) {
      const items = visibleWidgetIds.filter((id) => {
        if (!permitted.has(id)) return false;
        if (WIDGET_META[id].category !== category) return false;
        if (!q) return true;
        const m = WIDGET_META[id];
        return m.title.toLowerCase().includes(q) || m.description.toLowerCase().includes(q);
      });
      if (items.length) out.push({ category, items });
    }
    return out;
  }, [visibleWidgetIds, q]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[92vw] max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="font-serif">Add a widget</DialogTitle>
          <DialogDescription>
            Choose from the widgets available to you. Widgets already on your dashboard
            are marked as added.
          </DialogDescription>
        </DialogHeader>

        {showSearch && (
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search widgets…"
              aria-label="Search widgets"
              className="pl-8"
            />
          </div>
        )}

        <div className="-mr-2 max-h-[60vh] space-y-5 overflow-y-auto pr-2">
          {grouped.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No widgets match “{query}”.
            </p>
          ) : (
            grouped.map(({ category, items }) => (
              <section key={category}>
                <h4 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                  {CATEGORY_LABEL[category]}
                </h4>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {items.map((id) => (
                    <CatalogRow
                      key={id}
                      id={id}
                      added={placedIds.has(id)}
                      onAdd={() => onAdd(id)}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CatalogRow({ id, added, onAdd }: { id: WidgetId; added: boolean; onAdd: () => void }) {
  const meta = WIDGET_META[id];
  const Icon = meta.icon;
  return (
    <li className="flex items-start gap-3 rounded-md border border-[var(--brand-border)] p-3">
      <span
        className="bg-brand-gold/10 text-brand-navy grid h-9 w-9 shrink-0 place-items-center rounded-md"
        aria-hidden
      >
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-brand-navy text-sm font-medium">{meta.title}</p>
        <p className="text-muted-foreground mt-0.5 text-xs leading-snug">{meta.description}</p>
      </div>
      {added ? (
        <span
          className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs"
          aria-label={`${meta.title} already added`}
        >
          <Check className="h-3.5 w-3.5" /> Added
        </span>
      ) : (
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Add ${meta.title}`}
          className="border-brand-navy/15 text-brand-charcoal hover:bg-brand-gold/10 hover:border-brand-gold/40 inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      )}
    </li>
  );
}
