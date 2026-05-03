"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth/profile";
import {
  inviteUserAdmin,
  reactivateUserAdmin,
  suspendUserAdmin,
  terminateUserAdmin,
  type InviteUserPayload,
} from "@/lib/api/users";
import { writeAuditLog } from "@/lib/auth/audit";
import { getRequestInfo } from "@/lib/auth/request-info";
import type { DbRole } from "@/lib/types/database";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Asserts the caller is an authenticated active Admin. Used as the gate at
 * the top of every privileged action in this file.
 */
async function requireAdmin(): Promise<
  | { ok: true; admin: { id: string; email: string } }
  | { ok: false; error: string }
> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  if (me.status !== "Active")
    return { ok: false, error: "Your account is not active." };
  if (me.role !== "Admin")
    return { ok: false, error: "Admin access required." };
  return { ok: true, admin: { id: me.id, email: me.email } };
}

// ----------------------------------------------------------------------------
// Invite

const ALLOWED_INVITE_ROLES: DbRole[] = ["Admin", "SalesRep"];

export interface InviteUserInput {
  email: string;
  first_name: string;
  last_name: string;
  role: DbRole;
  title?: string | null;
  department?: string | null;
  phone?: string | null;
}

export async function inviteUserAction(
  input: InviteUserInput
): Promise<ActionResult<{ user_id: string; email: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  // Trim + validate input.
  const email = (input.email ?? "").trim().toLowerCase();
  const first_name = (input.first_name ?? "").trim();
  const last_name = (input.last_name ?? "").trim();
  if (!email || !first_name || !last_name) {
    return { ok: false, error: "Email, first name, and last name are required." };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "That email doesn't look right." };
  }
  if (!ALLOWED_INVITE_ROLES.includes(input.role)) {
    return {
      ok: false,
      error: "Only Admin and SalesRep can be invited from the UI right now.",
    };
  }

  const { ip, userAgent } = await getRequestInfo();

  const payload: InviteUserPayload = {
    email,
    first_name,
    last_name,
    role: input.role,
    title: input.title ?? null,
    department: input.department ?? null,
    phone: input.phone ?? null,
    invited_by: gate.admin.id,
  };

  try {
    const result = await inviteUserAdmin(payload);
    await writeAuditLog("user_invited", {
      user_id: result.user_id,
      email: result.email,
      ip,
      user_agent: userAgent,
      metadata: {
        role: input.role,
        invited_by: gate.admin.id,
        invited_by_email: gate.admin.email,
      },
    });
    revalidatePath("/users");
    return { ok: true, data: result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown invite error.";
    // Surface the most common Supabase error verbatim — duplicate email is
    // the one users will hit most.
    return {
      ok: false,
      error: msg.toLowerCase().includes("already")
        ? "A user with that email is already in the directory."
        : msg,
    };
  }
}

// ----------------------------------------------------------------------------
// Status changes

async function statusChange(
  userId: string,
  kind: "suspend" | "reactivate" | "terminate"
): Promise<ActionResult<{ user_id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  if (userId === gate.admin.id) {
    return {
      ok: false,
      error: "You can't change your own account status from this screen.",
    };
  }

  const { ip, userAgent } = await getRequestInfo();

  try {
    const updated =
      kind === "suspend"
        ? await suspendUserAdmin(userId)
        : kind === "reactivate"
        ? await reactivateUserAdmin(userId)
        : await terminateUserAdmin(userId);

    const event =
      kind === "suspend"
        ? "user_suspended"
        : kind === "reactivate"
        ? "user_reactivated"
        : "user_terminated";

    await writeAuditLog(event, {
      user_id: updated.id,
      email: updated.email,
      ip,
      user_agent: userAgent,
      metadata: { actor: gate.admin.id },
    });

    if (kind !== "reactivate") {
      // Sessions revoked — log that too so the audit trail is explicit.
      await writeAuditLog("session_revoked", {
        user_id: updated.id,
        email: updated.email,
        ip,
        user_agent: userAgent,
        metadata: { reason: kind, actor: gate.admin.id },
      });
    }

    revalidatePath("/users");
    return { ok: true, data: { user_id: updated.id } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unknown error.",
    };
  }
}

export async function suspendUserAction(
  userId: string
): Promise<ActionResult<{ user_id: string }>> {
  return statusChange(userId, "suspend");
}

export async function reactivateUserAction(
  userId: string
): Promise<ActionResult<{ user_id: string }>> {
  return statusChange(userId, "reactivate");
}

export async function terminateUserAction(
  userId: string
): Promise<ActionResult<{ user_id: string }>> {
  return statusChange(userId, "terminate");
}
