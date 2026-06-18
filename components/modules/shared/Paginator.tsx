"use client";

// SHARED — reusable pager for history-style lists. Convention: `page` is
// ZERO-BASED internally and over the wire (page 0 = the first page); the
// numbered buttons only DISPLAY 1-based labels. Range readout reads
// "X–Y of N" with the displayed (1-based) bounds.

import { useCallback, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];

/**
 * Persist a per-user page-size choice in localStorage (SSR-safe). Returns the
 * current size + a setter that writes through. Reads lazily on mount; the
 * fallback is used until/if hydration provides a stored value.
 */
export function usePersistedPageSize(
  storageKey: string,
  fallback = 10
): [number, (n: number) => void] {
  // Lazy initializer — runs once. `typeof window` guards SSR.
  const read = (): number => {
    if (typeof window === "undefined") return fallback;
    const raw = window.localStorage.getItem(storageKey);
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const [size, setSize] = useState(read);

  const set = useCallback(
    (n: number) => {
      setSize(n);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, String(n));
      }
    },
    [storageKey, setSize]
  );

  return [size, set];
}

export function Paginator({
  totalItems,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: {
  totalItems: number;
  /** ZERO-BASED current page. */
  page: number;
  pageSize: number;
  /** Receives a ZERO-BASED page index. */
  onPageChange: (p: number) => void;
  onPageSizeChange: (n: number) => void;
  pageSizeOptions?: number[];
  /** Reserved for callers that want to key persistence; not read directly. */
  storageKey?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);

  const start = totalItems === 0 ? 0 : safePage * pageSize + 1;
  const end = Math.min(safePage * pageSize + pageSize, totalItems);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-2 text-xs">
      <span className="text-muted-foreground tabular-nums">
        {start}–{end} of {totalItems}
      </span>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Rows per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              const n = Number(v);
              if (Number.isFinite(n) && n > 0) {
                onPageSizeChange(n);
                // Page-size change always returns to the first page.
                onPageChange(0);
              }
            }}
          >
            <SelectTrigger size="sm" className="w-16">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="xs"
            variant="outline"
            aria-label="Previous page"
            onClick={() => onPageChange(Math.max(0, safePage - 1))}
            disabled={safePage === 0}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>

          {pageWindow(safePage, pageCount).map((item, i) =>
            item === "…" ? (
              <span
                key={`gap-${i}`}
                className="text-muted-foreground px-1 select-none"
              >
                …
              </span>
            ) : (
              <Button
                key={item}
                type="button"
                size="xs"
                variant={item === safePage ? "default" : "outline"}
                aria-current={item === safePage ? "page" : undefined}
                onClick={() => onPageChange(item)}
                className="min-w-6 tabular-nums"
              >
                {item + 1}
              </Button>
            )
          )}

          <Button
            type="button"
            size="xs"
            variant="outline"
            aria-label="Next page"
            onClick={() => onPageChange(Math.min(pageCount - 1, safePage + 1))}
            disabled={safePage >= pageCount - 1}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Numbered-button window (all zero-based). ≤7 pages → show them all; otherwise
 * a compact set: first, an ellipsis, the current ±1 neighbours, an ellipsis,
 * and last. Returns page indices interleaved with "…" markers.
 */
function pageWindow(current: number, pageCount: number): (number | "…")[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i);
  }

  const out: (number | "…")[] = [];
  const first = 0;
  const last = pageCount - 1;

  const lo = Math.max(first + 1, current - 1);
  const hi = Math.min(last - 1, current + 1);

  out.push(first);
  if (lo > first + 1) out.push("…");
  for (let p = lo; p <= hi; p++) out.push(p);
  if (hi < last - 1) out.push("…");
  out.push(last);

  return out;
}
