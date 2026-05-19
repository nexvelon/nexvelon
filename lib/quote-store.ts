"use client";

import { useEffect, useState } from "react";
import type { Quote } from "./types";
import { quotes as seedQuotes } from "./mock-data/quotes";

const STORAGE_KEY = "nexvelon:quotes:v1";
const listeners = new Set<() => void>();

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
          // QB-6: vendor is meaningless on labour lines — clear any stale value.
          const l6 = li as unknown as {
            type?: string;
            vendor?: string;
          };
          if (l6.type === "labor" && l6.vendor !== undefined) {
            l6.vendor = undefined;
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
        }
      }
    }
    return parsed;
  } catch {
    return {};
  }
}

function writeOverrides(map: Record<string, Quote>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota exceeded — ignore for demo */
  }
}

export function getMergedQuotes(): Quote[] {
  const overrides = readOverrides();
  const byId = new Map<string, Quote>();
  for (const q of seedQuotes) byId.set(q.id, q);
  for (const id in overrides) byId.set(id, overrides[id]);
  return [...byId.values()];
}

export function getQuoteById(id: string): Quote | undefined {
  return getMergedQuotes().find((q) => q.id === id);
}

export function upsertQuote(quote: Quote): void {
  const overrides = readOverrides();
  overrides[quote.id] = quote;
  writeOverrides(overrides);
  for (const listener of listeners) listener();
}

export function resetOverrides(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  for (const listener of listeners) listener();
}

export function useQuotes(): Quote[] {
  // Render seed on server + first client render to avoid hydration mismatches,
  // then sync with localStorage after mount.
  const [quotes, setQuotes] = useState<Quote[]>(seedQuotes);

  useEffect(() => {
    setQuotes(getMergedQuotes());
    const listener = () => setQuotes(getMergedQuotes());
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return quotes;
}

export function useQuote(id: string | undefined): Quote | undefined {
  const all = useQuotes();
  if (!id) return undefined;
  return all.find((q) => q.id === id);
}
