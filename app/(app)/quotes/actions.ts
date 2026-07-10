"use server";

// Chunk F-1a — quotes server actions (plumbing; no UI cutover yet). Uniform
// ActionResult shape mirroring the other action files; RLS gates reads/writes
// to authenticated callers. revalidate the quotes paths on write.

import { revalidatePath } from "next/cache";
import {
  deleteQuote,
  getQuoteById,
  listQuotes,
  listProjectsReferencingQuote,
  upsertQuote,
  mintQuoteNumber,
  findQuoteIdByNumber,
  updateQuoteNumber,
  updateQuoteDate,
} from "@/lib/api/quotes";
import { deleteAttachmentsForEntity } from "@/app/(app)/attachments/actions";
import {
  getQuoteAuditEvents,
  logQuoteAuditEvent,
  deleteQuoteAuditById,
  deleteAllQuoteAuditForQuote,
} from "@/lib/api/quote-audit";
import { getCurrentProfile } from "@/lib/auth/profile";
import { getClients, getSitesByClient } from "@/lib/api/clients";
import { getProjectRow } from "@/lib/api/projects";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { diffQuote } from "@/lib/quote-audit-diff";
import { newId } from "@/lib/quote-helpers";
import { businessDateISO } from "@/lib/format";
import { adaptClient, adaptSite } from "@/lib/quotes/picker-adapters";
import type { Client, Quote, Role, Site } from "@/lib/types";
import type { DbQuoteAuditLog, DbRole } from "@/lib/types/database";

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

// BUGFIX (quotes) — picker data for the EDIT route. The "new" route fetches +
// adapts clients/sites in its server component and passes them to QuoteBuilder;
// the edit route is a client component, so it calls this action instead. Same
// adapters (lib/quotes/picker-adapters) → identical picker behaviour on both
// routes. Returns clients + a client_id → sites map matching the override props.
export interface QuotePickerData {
  clients: Client[];
  sitesByClient: Record<string, Site[]>;
}

export async function getQuotePickerDataAction(): Promise<
  ActionResult<QuotePickerData>
> {
  try {
    const dbClients = await getClients();
    const sitesByClient: Record<string, Site[]> = {};
    if (dbClients.length > 0) {
      const results = await Promise.all(
        dbClients.map(async (c) => ({
          id: c.id,
          sites: await getSitesByClient(c.id),
        }))
      );
      for (const { id, sites } of results) {
        sitesByClient[id] = sites.map(adaptSite);
      }
    }
    return {
      ok: true,
      data: { clients: dbClients.map(adaptClient), sitesByClient },
    };
  } catch (e) {
    return fail(e);
  }
}

// PROJ2-5 — validate the quote's intended conversion target BEFORE persisting.
// Enforces the same shape as the 0086 CHECK plus a cross-reference the DB can't
// do: a change_order target must be a real project on the quote's OWN site AND
// client. Returns a typed error string, or null when valid.
async function validateIntendedTarget(quote: Quote): Promise<string | null> {
  const kind = quote.intendedTargetKind ?? null;
  const projectId = quote.intendedTargetProjectId ?? null;

  if (kind === null || kind === "new_project") {
    // A non-change-order intent never carries a project id.
    return projectId ? "invalid_convert_target" : null;
  }

  // kind === "change_order"
  if (!projectId) return "invalid_convert_target";
  const project = await getProjectRow(projectId);
  if (!project) return "invalid_convert_target";
  // The change order must live on the quote's site and client.
  if (project.site_id !== (quote.siteId ?? null)) return "invalid_convert_target";
  if (project.client_id !== (quote.clientId ?? null)) return "invalid_convert_target";
  return null;
}

export async function upsertQuoteAction(
  quote: Quote
): Promise<ActionResult<Quote>> {
  try {
    // AUDIT-1: capture the prior row BEFORE the upsert so we can detect a
    // first-create and status transitions.
    const prior = await getQuoteById(quote.id);

    // PROJ2-5 — reject an inconsistent intended conversion target before write.
    const targetError = await validateIntendedTarget(quote);
    if (targetError) return { ok: false, error: targetError };

    // QUOTES-5 defense-in-depth: block ANY path that flips a not-yet-Sent quote
    // to Sent without a client + site. sendQuoteAction is the canonical
    // validated Draft→Sent path; this catches direct upsert writes (the old
    // builder button, future callers, or a crafted API payload).
    if (quote.status === "Sent") {
      const wasNotSent = !prior || prior.status !== "Sent";
      if (wasNotSent && (!quote.clientId || !quote.siteId)) {
        return {
          ok: false,
          error: "Cannot mark quote as Sent without a client and site.",
        };
      }
    }

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

// QUOTES-2 — the durable server guard for "Send to Client". Takes only an id
// and RE-READS the quote from the DB, so a crafted client payload can't bypass
// the check by spreading a different status/client/site. Only a Draft with both
// a client AND a site may transition to Sent. Delegates the actual write to
// upsertQuoteAction so the status_changed audit event + revalidate still fire.
// (No email is dispatched yet — that's a future ticket; this is the surface it
// will hang off.)
export async function sendQuoteAction(
  quoteId: string
): Promise<ActionResult<Quote>> {
  try {
    const quote = await getQuoteById(quoteId);
    if (!quote) return { ok: false, error: "Quote not found" };
    if (quote.status !== "Draft" || !quote.clientId || !quote.siteId) {
      throw new Error(
        `Cannot send: status=${quote.status}, client_id=${
          quote.clientId ?? "null"
        }, site_id=${quote.siteId ?? "null"}`
      );
    }
    return await upsertQuoteAction({ ...quote, status: "Sent" });
  } catch (e) {
    return fail(e);
  }
}

// QUOTES-3 — Admin-only hard delete of a DRAFT quote. Signature preserved
// (single string arg) so existing callers stay compatible. This is the durable
// guard: it re-reads the quote server-side, so a direct API call can't bypass
// the status/reference checks. Non-drafts keep their normal lifecycle
// transitions; a quote referenced by a project cost center can't be deleted.
export async function deleteQuoteAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;

    // Source of truth — the DB row, not anything the client passed.
    const quote = await getQuoteById(id);
    if (!quote) return { ok: false, error: "Quote not found" };

    if (quote.status !== "Draft") {
      return {
        ok: false,
        error: `Cannot delete a ${quote.status} quote. Only drafts can be deleted.`,
      };
    }

    // Block if a project sourced a cost center from this quote (0042) — the FK
    // is ON DELETE SET NULL, so the DB wouldn't error, but we don't want to
    // silently sever that provenance link.
    const refs = await listProjectsReferencingQuote(id);
    if (refs.length > 0) {
      return {
        ok: false,
        error: `Cannot delete: this quote is referenced by ${refs.length} project cost center(s).`,
      };
    }

    // Audit BEFORE the row is gone, so the trail survives the hard delete
    // (quote_audit_log is not cascaded — deliberately durable). Best-effort:
    // never let an audit hiccup block the delete the admin asked for.
    try {
      const actor = await resolveAuditActor();
      await logQuoteAuditEvent({
        quoteId: id,
        actorId: actor.id,
        actorName: actor.name,
        eventType: "deleted",
        changes: { before: quote, after: null },
      });
    } catch (auditErr) {
      console.error("[quote_audit_log] delete event logging failed:", auditErr);
    }

    // Hard-delete + attachments cleanup (existing pattern).
    await deleteAttachmentsForEntity("quote", id).catch(() => {});
    const deleted = await deleteQuote(id);
    if (!deleted) return { ok: false, error: "Quote not found" };

    revalidatePath("/quotes");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

// ── AUDIT-1: admin hard-delete of quote history (HARD delete, no audit) ───────
// The History panel is already admin-only client-side; these gate the writes on
// the server too (canonical admin gate, mirrors techs-actions.ts).
async function requireAdmin(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  if (me.status !== "Active")
    return { ok: false, error: "Your account is not active." };
  if (me.role !== "Admin") return { ok: false, error: "Admin access required." };
  return { ok: true };
}

export async function deleteQuoteAuditByIdAction(
  id: string
): Promise<ActionResult<{ deleted: boolean }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const deleted = await deleteQuoteAuditById(id);
    return { ok: true, data: { deleted } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAllQuoteAuditForQuoteAction(
  quoteId: string
): Promise<ActionResult<{ deleted: number }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const deleted = await deleteAllQuoteAuditForQuote(quoteId);
    return { ok: true, data: { deleted } };
  } catch (e) {
    return fail(e);
  }
}

// ── Editable number/date + duplicate (this chunk) ────────────────────────────

// DbRole (11) → app Role (7) for hasPermission; mirrors the other action files.
function adaptRole(r: DbRole): Role {
  switch (r) {
    case "Admin":
    case "ProjectManager":
    case "SalesRep":
    case "Technician":
    case "Subcontractor":
    case "Accountant":
    case "ViewOnly":
      return r;
    case "LeadTechnician":
      return "Technician";
    case "Dispatcher":
      return "ProjectManager";
    case "Warehouse":
      return "Technician";
    case "ClientPortal":
      return "ViewOnly";
  }
}

async function requireQuotesPermission(
  action: "edit" | "create"
): Promise<{ ok: true; actorId: string } | { ok: false; error: string }> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  if (!hasPermission(adaptRole(me.role), "quotes", action)) {
    return { ok: false, error: "forbidden" };
  }
  return { ok: true, actorId: me.id };
}

// A quote number is either the sequential Q-<digits> or any short prefixed
// identifier the admin wants (e.g. INV-2024-1). Deliberately permissive per spec.
function isValidQuoteNumber(n: string): boolean {
  return /^Q-\d+$/.test(n) || /^[A-Z]{1,4}-.+$/.test(n);
}

// Edit a quote's number. Gated on quotes:edit. Duplicate numbers are allowed but
// require an explicit `force` (after the UI confirms), so a clash is a conscious
// choice — the /reports/duplicate-quote-numbers page surfaces any that exist.
export async function updateQuoteNumberAction(input: {
  quoteId: string;
  newNumber: string;
  force?: boolean;
}): Promise<
  { ok: true } | { ok: false; error: string; existing_quote_id?: string }
> {
  try {
    const gate = await requireQuotesPermission("edit");
    if (!gate.ok) return { ok: false, error: "forbidden" };

    const num = input.newNumber.trim();
    if (!isValidQuoteNumber(num)) {
      return { ok: false, error: "invalid_format" };
    }

    if (!input.force) {
      const existing = await findQuoteIdByNumber(num, input.quoteId);
      if (existing) {
        return {
          ok: false,
          error: "duplicate_exists",
          existing_quote_id: existing,
        };
      }
    }

    await updateQuoteNumber(input.quoteId, num);

    // Best-effort audit — never fail the edit on a log error.
    try {
      const actor = await resolveAuditActor();
      await logQuoteAuditEvent({
        quoteId: input.quoteId,
        actorId: actor.id,
        actorName: actor.name,
        eventType: "updated",
        changes: { number: { from: null, to: num } },
      });
    } catch (logErr) {
      console.error("[quote_audit] number update log failed:", logErr);
    }

    revalidatePath("/quotes");
    revalidatePath(`/quotes/${input.quoteId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// Edit a quote's date (the date shown on the PDF). Gated on quotes:edit.
export async function updateQuoteDateAction(input: {
  quoteId: string;
  newDate: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const gate = await requireQuotesPermission("edit");
    if (!gate.ok) return { ok: false, error: "forbidden" };

    const date = input.newDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
      return { ok: false, error: "invalid_date" };
    }

    await updateQuoteDate(input.quoteId, date);

    try {
      const actor = await resolveAuditActor();
      await logQuoteAuditEvent({
        quoteId: input.quoteId,
        actorId: actor.id,
        actorName: actor.name,
        eventType: "updated",
        changes: { quote_date: { from: null, to: date } },
      });
    } catch (logErr) {
      console.error("[quote_audit] date update log failed:", logErr);
    }

    revalidatePath("/quotes");
    revalidatePath(`/quotes/${input.quoteId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// Duplicate a quote (any status) into a fresh Draft. Gated on quotes:create.
// Deep-clones the data blob, mints a NEW sequential number, resets status/date/
// conversion-intent, and clears per-line committed-stock markers. Attachments
// are intentionally NOT copied (a duplicate starts clean — no double-referenced
// storage objects). The source quote is untouched.
export async function duplicateQuoteAction(
  sourceQuoteId: string
): Promise<
  { ok: true; newQuoteId: string } | { ok: false; error: string }
> {
  try {
    const gate = await requireQuotesPermission("create");
    if (!gate.ok) return { ok: false, error: "forbidden" };

    const src = await getQuoteById(sourceQuoteId);
    if (!src) return { ok: false, error: "Quote not found" };

    const newQuoteId = newId("q");
    const newNumber = await mintQuoteNumber();
    const today = businessDateISO();

    // Deep clone (the Quote is pure JSON) so nested sections/items/schedules are
    // copied by value and the source is never mutated.
    const dup: Quote = JSON.parse(JSON.stringify(src));
    dup.id = newQuoteId;
    dup.number = newNumber;
    dup.status = "Draft";
    dup.createdAt = today;
    dup.quoteDate = today;
    dup.projectId = undefined;
    // Fresh conversion intent (0086 shape: both null).
    dup.intendedTargetKind = undefined;
    dup.intendedTargetProjectId = undefined;
    // A fresh Draft carries no revision/closing history.
    dup.rejectionReason = undefined;
    dup.rejectionSource = undefined;
    dup.rejectedAt = undefined;
    dup.rejectedByUser = undefined;
    dup.closingReason = undefined;
    dup.closedAt = undefined;
    dup.closedByUser = undefined;
    // Clear committed-stock / serial snapshots so the copy hasn't "consumed" any
    // inventory (mirrors the list-page duplicate).
    for (const section of dup.sections ?? []) {
      for (const item of section.items ?? []) {
        item.committedStockId = undefined;
        item.serialNumber = undefined;
      }
    }

    const saved = await upsertQuote(dup);

    // Best-effort audit — a "created" event on the new quote noting its source.
    try {
      const actor = await resolveAuditActor();
      await logQuoteAuditEvent({
        quoteId: saved.id,
        actorId: actor.id,
        actorName: actor.name,
        eventType: "created",
        changes: {
          status: { from: null, to: "Draft" },
          duplicated_from: { from: null, to: sourceQuoteId },
        },
      });
    } catch (logErr) {
      console.error("[quote_audit] duplicate create log failed:", logErr);
    }

    revalidatePath("/quotes");
    return { ok: true, newQuoteId: saved.id };
  } catch (e) {
    return fail(e);
  }
}
