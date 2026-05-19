"use server";

import { revalidatePath } from "next/cache";
import {
  type DbMarginTier,
  createMarginTier,
  hardDeleteMarginTier,
  listMarginTiers,
  restoreMarginTier,
  softDeleteMarginTier,
  updateMarginTier,
} from "@/lib/api/margin-tiers";
import { getCurrentProfile } from "@/lib/auth/profile";

// Uniform { ok, ... } result shape — mirrors app/(app)/clients/actions.ts.
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

/**
 * Asserts the caller is an authenticated active Admin. Copied verbatim from
 * app/(app)/clients/actions.ts requireAdmin() (the canonical admin gate).
 */
async function requireAdmin(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  if (me.status !== "Active")
    return { ok: false, error: "Your account is not active." };
  if (me.role !== "Admin")
    return { ok: false, error: "Admin access required." };
  return { ok: true };
}

function revalidate() {
  revalidatePath("/settings");
}

export async function listMarginTiersAction(
  opts: { includeInactive?: boolean } = {}
): Promise<ActionResult<DbMarginTier[]>> {
  try {
    const rows = await listMarginTiers(opts);
    return { ok: true, data: rows };
  } catch (e) {
    return fail(e);
  }
}

export async function createMarginTierAction(payload: {
  category: string;
  tier_1: number;
  tier_2: number;
  tier_3: number;
  display_order: number;
  is_active?: boolean;
}): Promise<ActionResult<DbMarginTier>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const row = await createMarginTier(payload);
    revalidate();
    return { ok: true, data: row };
  } catch (e) {
    return fail(e);
  }
}

export async function updateMarginTierAction(
  id: string,
  payload: Partial<{
    category: string;
    tier_1: number;
    tier_2: number;
    tier_3: number;
    display_order: number;
    is_active: boolean;
  }>
): Promise<ActionResult<DbMarginTier>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const row = await updateMarginTier(id, payload);
    revalidate();
    return { ok: true, data: row };
  } catch (e) {
    return fail(e);
  }
}

export async function softDeleteMarginTierAction(
  id: string
): Promise<ActionResult<boolean>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const done = await softDeleteMarginTier(id);
    revalidate();
    return { ok: true, data: done };
  } catch (e) {
    return fail(e);
  }
}

export async function restoreMarginTierAction(
  id: string
): Promise<ActionResult<boolean>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const done = await restoreMarginTier(id);
    revalidate();
    return { ok: true, data: done };
  } catch (e) {
    return fail(e);
  }
}

export async function hardDeleteMarginTierAction(
  id: string
): Promise<ActionResult<boolean>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const ok = await hardDeleteMarginTier(id);
    revalidate();
    return { ok: true, data: ok };
  } catch (e) {
    return fail(e);
  }
}
