"use server";

// PART-FORM B1 — server actions for the managed manufacturers list. Mirrors
// inventory-vocab-actions.ts: uniform ActionResult, reads open to authenticated
// callers, writes gated by requireAdmin (the canonical admin gate).

import { revalidatePath } from "next/cache";
import {
  listManufacturers,
  createManufacturer,
  renameManufacturer,
  deleteManufacturer,
} from "@/lib/api/manufacturers";
import { getCurrentProfile } from "@/lib/auth/profile";
import type { DbManufacturer } from "@/lib/types/database";

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

export async function listManufacturersAction(): Promise<
  ActionResult<DbManufacturer[]>
> {
  try {
    return { ok: true, data: await listManufacturers() };
  } catch (e) {
    return fail(e);
  }
}

export async function createManufacturerAction(
  name: string
): Promise<ActionResult<DbManufacturer>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const trimmed = name.trim();
    if (trimmed === "") return { ok: false, error: "Name is required." };
    const row = await createManufacturer(trimmed);
    revalidate();
    return { ok: true, data: row };
  } catch (e) {
    return fail(e);
  }
}

export async function renameManufacturerAction(
  id: string,
  name: string
): Promise<ActionResult<DbManufacturer>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const trimmed = name.trim();
    if (trimmed === "") return { ok: false, error: "Name is required." };
    const row = await renameManufacturer(id, trimmed);
    revalidate();
    return { ok: true, data: row };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteManufacturerAction(
  id: string
): Promise<ActionResult<{ deleted: boolean }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const deleted = await deleteManufacturer(id);
    revalidate();
    return { ok: true, data: { deleted } };
  } catch (e) {
    return fail(e);
  }
}
