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
    return parsed && typeof parsed === "object" ? parsed : {};
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
