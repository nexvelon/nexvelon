import "server-only";

// SEC-1 — server-side redaction of permission-gated fields. REALITY-1
// (docs/BUILD_STATE_AUDIT.md §4.2/§5, P0-1) found cost / margin / internal-notes
// were hidden client-side only while the server returned them on the wire. This is
// the ONE place that resolves the three field-visibility gates and redacts, mirroring
// the wip-actions.ts pattern (gate server-side, null the protected field, hand the
// client a `canSee*` flag). Client-side hiding stays as defence-in-depth.
//
// Redaction = the field is NULL, never zeroed — a zero cost is a lie (§2.8), an
// absent value is honest. Fail closed: if a gate can't be resolved, redact.

import { can } from "./resolve";
import type { Quote } from "@/lib/types";

export interface FieldGates {
  /** inventory:viewCost — per-unit cost, avg cost, total value, per-lot unit_cost. */
  inventoryCost: boolean;
  /** quotes:viewMargin — cost + margin on quote lines. */
  quoteMargin: boolean;
  /** quotes:viewInternal — the PM-only internal notes. */
  quoteInternal: boolean;
  /** Cost is trusted in EITHER cost context. The product catalog read is shared by
   *  the inventory pages and the quote builder, so a caller trusted with cost in
   *  either place may receive it. (Today viewMargin holders also hold viewCost, so
   *  this only widens for a future role that has one but not the other.) */
  anyCost: boolean;
}

/** Resolve the field-visibility gates once, server-side, fail-closed. */
export async function resolveFieldGates(): Promise<FieldGates> {
  try {
    const [inventoryCost, quoteMargin, quoteInternal] = await Promise.all([
      can("inventory", "viewCost"),
      can("quotes", "viewMargin"),
      can("quotes", "viewInternal"),
    ]);
    return {
      inventoryCost,
      quoteMargin,
      quoteInternal,
      anyCost: inventoryCost || quoteMargin,
    };
  } catch {
    // Never expose a gated value on an error path.
    return { inventoryCost: false, quoteMargin: false, quoteInternal: false, anyCost: false };
  }
}

/**
 * SEC-1 — strip the quote's cost/margin/internal fields from the wire per the
 * resolved gates. Cost & margin (on every section line) require quotes:viewMargin;
 * the internal notes + labour technician names require quotes:viewInternal.
 * Redaction is null/absent, never zeroed (§2.8). The selling price, quantities,
 * and price totals are NOT cost-derived and are preserved.
 *
 * Reads that hydrate the builder still return a fully editable quote — a redacted
 * caller (e.g. a SalesRep with quotes:edit but not viewMargin) can edit prices;
 * upsertQuoteAction restores the real cost/margin/internal values from the prior
 * blob so their save never clobbers them.
 */
export function redactQuote(
  quote: Quote,
  gates: Pick<FieldGates, "quoteMargin" | "quoteInternal">
): Quote {
  if (gates.quoteMargin && gates.quoteInternal) return quote;

  const sections = quote.sections?.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      let next = item;
      if (!gates.quoteMargin) {
        next = { ...next, unitCost: null, margin: null };
      }
      if (!gates.quoteInternal && next.labour?.techName != null) {
        next = { ...next, labour: { ...next.labour, techName: undefined } };
      }
      return next;
    }),
  }));

  return {
    ...quote,
    ...(sections ? { sections } : {}),
    ...(gates.quoteInternal ? {} : { internalNotes: undefined }),
  };
}
