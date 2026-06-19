"use server";

// POLISH-3 — admin actions for the client-invitation system: send an invite,
// list pending-review clients, and approve / reject them. Admin-gated.

import { revalidatePath } from "next/cache";
import { createInvitation } from "@/lib/api/client-invitations";
import { sendClientInviteEmail } from "@/lib/auth/email";
import { getClients, updateClient, deleteClient } from "@/lib/api/clients";
import { getCurrentProfile } from "@/lib/auth/profile";
import type { DbClientWithCounts } from "@/lib/types/database";

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

async function requireAdmin(): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  if (me.status !== "Active")
    return { ok: false, error: "Your account is not active." };
  if (me.role !== "Admin") return { ok: false, error: "Admin access required." };
  return { ok: true, id: me.id };
}

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://app.nexvelonglobal.com";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendClientInviteAction(
  email: string
): Promise<ActionResult<{ token: string }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed))
      return { ok: false, error: "Enter a valid email address." };
    const inv = await createInvitation({
      email: trimmed,
      createdBy: gate.id,
      inviteType: "full",
    });
    await sendClientInviteEmail({
      to: trimmed,
      token: inv.token,
      baseUrl: baseUrl(),
      inviteType: "full",
    });
    revalidatePath("/clients");
    return { ok: true, data: { token: inv.token } };
  } catch (e) {
    return fail(e);
  }
}

// POLISH-4 — Type B: invite an existing client to add a SITE. No new client is
// created on submit; a site is attached to clientId. Email defaults to the
// admin-provided address (often a contact at the same client).
export async function sendSiteInviteAction(
  clientId: string,
  email: string
): Promise<ActionResult<{ token: string }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed))
      return { ok: false, error: "Enter a valid email address." };
    if (!clientId) return { ok: false, error: "Missing client." };
    const inv = await createInvitation({
      email: trimmed,
      createdBy: gate.id,
      inviteType: "site_only",
      clientId,
    });
    await sendClientInviteEmail({
      to: trimmed,
      token: inv.token,
      baseUrl: baseUrl(),
      inviteType: "site_only",
    });
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, data: { token: inv.token } };
  } catch (e) {
    return fail(e);
  }
}

export async function listPendingClientsAction(): Promise<
  ActionResult<DbClientWithCounts[]>
> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    return { ok: true, data: await getClients({ pending_review: true }) };
  } catch (e) {
    return fail(e);
  }
}

export async function approvePendingClientAction(
  id: string
): Promise<ActionResult<{ approved: true }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    await updateClient(id, { pending_review: false });
    revalidatePath("/clients");
    return { ok: true, data: { approved: true } };
  } catch (e) {
    return fail(e);
  }
}

export async function rejectPendingClientAction(
  id: string
): Promise<ActionResult<{ rejected: boolean }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    // Hard-delete the client; its sites cascade and the invitation's client_id
    // is auto-nulled (FK ON DELETE SET NULL) — leaving the invitation submitted
    // but unconverted for traceability.
    const deleted = await deleteClient(id);
    revalidatePath("/clients");
    return { ok: true, data: { rejected: deleted } };
  } catch (e) {
    return fail(e);
  }
}
