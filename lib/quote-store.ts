"use client";

// F-1b — quote store cutover: the public API (useQuotes / useQuote /
// upsertQuote / getMergedQuotes / getQuoteById / resetOverrides) is preserved,
// but the backing store is now the DB (via the quotes server actions) instead
// of localStorage. An in-memory cache + the existing listener mechanism keep
// the synchronous-feel contract the consumers rely on: upsertQuote updates the
// cache and fires listeners IMMEDIATELY (optimistic), then persists async.
//
// localStorage is no longer the source of truth — readOverrides() (with its
// load-bearing legacy transforms) survives ONLY to drive the one-time import
// of previously-saved quotes into the DB on first load, then stays dormant.

import { useEffect, useState } from "react";
import type { Quote } from "./types";
import {
  listQuotesAction,
  upsertQuoteAction,
  getQuoteByIdAction,
} from "@/app/(app)/quotes/actions";

const STORAGE_KEY = "nexvelon:quotes:v1";
const MIGRATED_KEY = "nexvelon:quotes:migrated-to-db";
const listeners = new Set<() => void>();

// ── DB-backed in-memory cache ───────────────────────────────────────────────
let cache: Quote[] = [];
let loaded = false;
let loadPromise: Promise<void> | null = null;

function notify() {
  for (const listener of listeners) listener();
}

function readOverrides(): Record<string, Quote> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Quote>;
    if (!parsed || typeof parsed !== "object") return {};
    for (const id in parsed) {
      for (const sec of parsed[id]?.sections ?? []) {
        for (const li of sec.items ?? []) {
          // Compat: migrate legacy `markup` field to `margin` (QB-2)
          const legacy = li as unknown as {
            markup?: number;
            margin?: number;
          };
          if (legacy.margin === undefined && legacy.markup !== undefined) {
            const oldMarkup = legacy.markup;
            legacy.margin = Math.round((oldMarkup / (100 + oldMarkup)) * 100);
            delete legacy.markup;
          }
          // Compat: migrate legacy labour `hours`/`rate` to unified
          // qty/unitPrice + add name (QB-3)
          const l3 = li as unknown as {
            name?: string;
            type?: string;
            qty?: number;
            unitCost?: number;
            margin?: number;
            unitPrice?: number;
            hours?: number;
            rate?: number;
          };
          if (l3.name === undefined) {
            l3.name = "";
          }
          if (l3.type === "labor") {
            const legacyHours = l3.hours;
            const legacyRate = l3.rate;
            if (
              legacyHours !== undefined &&
              (l3.qty === undefined || l3.qty === 1)
            ) {
              l3.qty = legacyHours;
            }
            if (
              legacyRate !== undefined &&
              (!l3.unitPrice || l3.unitPrice === 0)
            ) {
              l3.unitPrice = legacyRate;
              // Derive unitCost from current margin (default 40)
              const m = l3.margin ?? 40;
              l3.unitCost = Math.round(legacyRate * (1 - m / 100) * 100) / 100;
            }
            delete l3.hours;
            delete l3.rate;
          }
          // QB-5a: backfill classification on any pre-existing line item.
          const l5 = li as unknown as {
            classification?: string;
            type?: string;
          };
          if (l5.classification === undefined) {
            l5.classification =
              l5.type === "labor" ? "Technician Labour" : "Materials";
          }
          // QB-8: lines that were classified as "Misc" under the old "both"
          // rule migrate to the new "misc" type. Schema rename — preserves
          // data and economics.
          const l8 = li as unknown as {
            classification?: string;
            type?: string;
          };
          if (l8.classification === "Misc" && l8.type !== "misc") {
            l8.type = "misc";
          }
          // QB-11: Warranty Cost / Service Cost were under type:"labor";
          // move to type:"service". Transformative migration — preserves
          // qty, costs, classification name; only the type field changes.
          const l11 = li as unknown as {
            classification?: string;
            type?: string;
          };
          if (
            l11.type === "labor" &&
            (l11.classification === "Warranty Cost" ||
              l11.classification === "Service Cost")
          ) {
            l11.type = "service";
          }
        }
      }
    }
    return parsed;
  } catch {
    return {};
  }
}

// ── One-time localStorage → DB import (idempotent) ──────────────────────────
// Replays readOverrides()'s transforms over the operator's real saved quotes
// (NOT mock seeds) and upserts each into the DB. The migrated flag is set ONLY
// after a fully successful import, so a partial failure retries next load and
// nothing re-imports once complete.
async function migrateLocalStorageQuotes(): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(MIGRATED_KEY)) return;

  const overrides = readOverrides();
  const quotes = Object.values(overrides);

  if (quotes.length === 0) {
    window.localStorage.setItem(MIGRATED_KEY, "1");
    return;
  }

  let allOk = true;
  for (const q of quotes) {
    const res = await upsertQuoteAction(q);
    if (!res.ok) {
      allOk = false;
      console.error("[quote-store] import failed for", q.id, res.error);
    }
  }
  if (allOk) window.localStorage.setItem(MIGRATED_KEY, "1");
}

// Hydrate the cache from the DB (once). Dedupes concurrent callers via a single
// in-flight promise. Runs the one-time import before the (re)load.
async function loadQuotes(): Promise<void> {
  if (loaded) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    await migrateLocalStorageQuotes();
    const res = await listQuotesAction();
    cache = res.ok ? res.data : [];
    loaded = true;
    notify();
  })();
  try {
    await loadPromise;
  } finally {
    loadPromise = null;
  }
}

export function getMergedQuotes(): Quote[] {
  // DB is the source of truth — returns the current cache (empty until loaded).
  return cache;
}

export function getQuoteById(id: string): Quote | undefined {
  return cache.find((q) => q.id === id);
}

/**
 * Optimistic upsert: replace/insert by id in the cache + fire listeners
 * IMMEDIATELY (preserves the synchronous-feel contract), THEN persist async.
 * Fire-and-forget — a persistence failure is logged, never thrown, never blocks
 * the UI.
 */
export function upsertQuote(quote: Quote): void {
  const idx = cache.findIndex((q) => q.id === quote.id);
  if (idx >= 0) cache = cache.map((q) => (q.id === quote.id ? quote : q));
  else cache = [quote, ...cache];
  notify();

  void upsertQuoteAction(quote).then((res) => {
    if (!res.ok) {
      console.error("[quote-store] upsert persist failed:", res.error);
    }
  });
}

// Retained for API compatibility. Clears the migration flag so a fresh import
// can run again; does not wipe DB data.
export function resetOverrides(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(MIGRATED_KEY);
  notify();
}

export function useQuotes(): Quote[] {
  const [quotes, setQuotes] = useState<Quote[]>(cache);

  useEffect(() => {
    const listener = () => setQuotes([...cache]);
    listeners.add(listener);
    // Trigger the first DB load (no-op if already loaded); sync current cache.
    void loadQuotes();
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return quotes;
}

export function useQuote(id: string | undefined): Quote | undefined {
  const all = useQuotes();
  const fromCache = id ? all.find((q) => q.id === id) : undefined;
  const [fallback, setFallback] = useState<Quote | undefined>(undefined);

  // If the quote isn't in the loaded list (e.g. deep-link to a quote outside
  // the current cache), fetch it directly once the list has loaded.
  useEffect(() => {
    if (!id || fromCache || !loaded) return;
    let active = true;
    void getQuoteByIdAction(id).then((res) => {
      if (active && res.ok && res.data) setFallback(res.data);
    });
    return () => {
      active = false;
    };
  }, [id, fromCache]);

  return fromCache ?? fallback;
}

/** F-1b: whether the first DB load has resolved — lets consumers (e.g. the
 *  new-quote number) defer until the quote list is hydrated. */
export function useQuotesLoaded(): boolean {
  const [isLoaded, setIsLoaded] = useState(loaded);
  useEffect(() => {
    const listener = () => setIsLoaded(loaded);
    listeners.add(listener);
    void loadQuotes();
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return isLoaded;
}
