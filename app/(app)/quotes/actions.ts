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
import { deleteAttachmentsForEntity } from "@/app/(app)/attachments/actions";
import {
  getQuoteAuditEvents,
  logQuoteAuditEvent,
} from "@/lib/api/quote-audit";
import { getCurrentProfile } from "@/lib/auth/profile";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { diffQuote } from "@/lib/quote-audit-diff";
import type { Quote } from "@/lib/types";
import type { DbQuoteAuditLog } from "@/lib/types/database";

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
    // AUDIT-1: capture the prior row BEFORE the upsert so we can detect a
    // first-create and status transitions.
    const prior = await getQuoteById(quote.id);

    const saved = await upsertQuote(quote);
    revalidatePath("/quotes");
    revalidatePath(`/quotes/${quote.id}`);

    // AUDIT-1: log create + status-change events. Never let an audit failure
    // break the save (logQuoteAuditEvent already swallows its own errors).
    try {
      const actor = await resolveAuditActor();
      if (!prior) {
        await logQuoteAuditEvent({
          quoteId: quote.id,
          actorId: actor.id,
          actorName: actor.name,
          eventType: "created",
          changes: { status: { from: null, to: saved.status } },
        });
      } else {
        // AUDIT-1: status transition (its own event).
        if (prior.status !== saved.status) {
          const changes: Record<string, unknown> = {
            status: { from: prior.status, to: saved.status },
          };
          if (saved.status === "Revision") {
            changes.rejectionReason = saved.rejectionReason ?? null;
            changes.rejectionSource = saved.rejectionSource ?? null;
          }
          if (saved.status === "Closed") {
            changes.closingReason = saved.closingReason ?? null;
          }
          await logQuoteAuditEvent({
            quoteId: quote.id,
            actorId: actor.id,
            actorName: actor.name,
            eventType: "status_changed",
            changes,
          });
        }
        // AUDIT-2: content diff. ONE "updated" event per save listing every
        // change. A single save may emit BOTH status_changed AND updated.
        const contentChanges = diffQuote(prior, saved);
        if (contentChanges.length > 0) {
          await logQuoteAuditEvent({
            quoteId: quote.id,
            actorId: actor.id,
            actorName: actor.name,
            eventType: "updated",
            changes: { items: contentChanges },
          });
        }
      }
    } catch (auditErr) {
      console.error("[quote_audit_log] event logging failed:", auditErr);
    }

    return { ok: true, data: saved };
  } catch (e) {
    return fail(e);
  }
}

// AUDIT-1: resolve the current actor for an audit row — id from the session,
// display name from the profile (falling back to email, then id).
async function resolveAuditActor(): Promise<{
  id: string | null;
  name: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const profile = await getCurrentProfile();
    const composed = [profile?.first_name, profile?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    const name =
      profile?.display_name?.trim() ||
      composed ||
      profile?.email ||
      user?.email ||
      user?.id ||
      null;
    return { id: user?.id ?? null, name };
  } catch {
    return { id: null, name: null };
  }
}

// AUDIT-1: admin-only read of a quote's audit trail (RLS enforces admin-only).
export async function getQuoteAuditEventsAction(
  quoteId: string
): Promise<ActionResult<DbQuoteAuditLog[]>> {
  try {
    const events = await getQuoteAuditEvents(quoteId);
    return { ok: true, data: events };
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
    // ATTACH-2: remove this quote's attachments (objects + rows). Best-effort.
    await deleteAttachmentsForEntity("quote", id).catch(() => {});
    revalidatePath("/quotes");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}
