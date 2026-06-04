"use server";

// Chunk B-1 — server actions for the inventory managed vocab. Mirrors
// classifications-actions.ts: uniform ActionResult, reads open to authenticated
// callers, writes gated by requireAdmin (the canonical admin gate).

import { revalidatePath } from "next/cache";
import {
  type DbInventoryVocab,
  type VocabKind,
  createVocab,
  listVocab,
  restoreVocab,
  softDeleteVocab,
  updateVocab,
} from "@/lib/api/inventory-vocab";
import { getCurrentProfile } from "@/lib/auth/profile";

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
  { ok: true } | { ok: false; error: string }
> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  if (me.status !== "Active")
    return { ok: false, error: "Your account is not active." };
  if (me.role !== "Admin") return { ok: false, error: "Admin access required." };
  return { ok: true };
}

function revalidate() {
  revalidatePath("/settings");
}

export async function listInventoryVocabAction(
  kind: VocabKind,
  opts: { includeInactive?: boolean } = {}
): Promise<ActionResult<DbInventoryVocab[]>> {
  try {
    return { ok: true, data: await listVocab(kind, opts) };
  } catch (e) {
    return fail(e);
  }
}

export async function createInventoryVocabAction(
  kind: VocabKind,
  name: string
): Promise<ActionResult<DbInventoryVocab>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const row = await createVocab(kind, name);
    revalidate();
    return { ok: true, data: row };
  } catch (e) {
    return fail(e);
  }
}

export async function updateInventoryVocabAction(
  id: string,
  payload: Partial<{ name: string; display_order: number; is_active: boolean }>
): Promise<ActionResult<DbInventoryVocab>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const row = await updateVocab(id, payload);
    revalidate();
    return { ok: true, data: row };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteInventoryVocabAction(
  id: string
): Promise<ActionResult<{ deactivated: boolean }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const deactivated = await softDeleteVocab(id);
    revalidate();
    return { ok: true, data: { deactivated } };
  } catch (e) {
    return fail(e);
  }
}

export async function restoreInventoryVocabAction(
  id: string
): Promise<ActionResult<{ restored: boolean }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const restored = await restoreVocab(id);
    revalidate();
    return { ok: true, data: { restored } };
  } catch (e) {
    return fail(e);
  }
}
