"use server";

import { revalidatePath } from "next/cache";
import {
  type DbLineItemClassification,
  createClassification,
  hardDeleteClassification,
  listClassifications,
  restoreClassification,
  softDeleteClassification,
  updateClassification,
} from "@/lib/api/classifications";
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
  revalidatePath("/quotes/new");
}

export async function listClassificationsAction(
  opts: { includeInactive?: boolean } = {}
): Promise<ActionResult<DbLineItemClassification[]>> {
  try {
    const rows = await listClassifications(opts);
    return { ok: true, data: rows };
  } catch (e) {
    return fail(e);
  }
}

export async function createClassificationAction(payload: {
  name: string;
  applies_to: "product" | "labor" | "misc" | "both" | "service";
  display_order: number;
  is_active?: boolean;
}): Promise<ActionResult<DbLineItemClassification>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const row = await createClassification(payload);
    revalidate();
    return { ok: true, data: row };
  } catch (e) {
    return fail(e);
  }
}

export async function updateClassificationAction(
  id: string,
  payload: Partial<{
    name: string;
    applies_to: "product" | "labor" | "misc" | "both" | "service";
    display_order: number;
    is_active: boolean;
  }>
): Promise<ActionResult<DbLineItemClassification>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const row = await updateClassification(id, payload);
    revalidate();
    return { ok: true, data: row };
  } catch (e) {
    return fail(e);
  }
}

export async function softDeleteClassificationAction(
  id: string
): Promise<ActionResult<boolean>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const done = await softDeleteClassification(id);
    revalidate();
    return { ok: true, data: done };
  } catch (e) {
    return fail(e);
  }
}

export async function restoreClassificationAction(
  id: string
): Promise<ActionResult<boolean>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const done = await restoreClassification(id);
    revalidate();
    return { ok: true, data: done };
  } catch (e) {
    return fail(e);
  }
}

export async function hardDeleteClassificationAction(
  id: string
): Promise<ActionResult<boolean>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const ok = await hardDeleteClassification(id);
    revalidate();
    return { ok: true, data: ok };
  } catch (e) {
    return fail(e);
  }
}
