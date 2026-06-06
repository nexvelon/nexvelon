"use server";

// Chunk F-1a — quotes server actions (plumbing; no UI cutover yet). Uniform
// ActionResult shape mirroring the other action files; RLS gates reads/writes
// to authenticated callers. revalidate the quotes paths on write.

import { revalidatePath } from "next/cache";
import {
  deleteQuote,
  getQuoteById,
  listQuotes,
  upsertQuote,
} from "@/lib/api/quotes";
import type { Quote } from "@/lib/types";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Unknown error";
  return { ok: false, error: message };
}

export async function listQuotesAction(): Promise<ActionResult<Quote[]>> {
  try {
    return { ok: true, data: await listQuotes() };
  } catch (e) {
    return fail(e);
  }
}

export async function getQuoteByIdAction(
  id: string
): Promise<ActionResult<Quote | null>> {
  try {
    return { ok: true, data: await getQuoteById(id) };
  } catch (e) {
    return fail(e);
  }
}

export async function upsertQuoteAction(
  quote: Quote
): Promise<ActionResult<Quote>> {
  try {
    const saved = await upsertQuote(quote);
    revalidatePath("/quotes");
    revalidatePath(`/quotes/${quote.id}`);
    return { ok: true, data: saved };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteQuoteAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const deleted = await deleteQuote(id);
    if (!deleted) return { ok: false, error: "Quote not found" };
    revalidatePath("/quotes");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}
