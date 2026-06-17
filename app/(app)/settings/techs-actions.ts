"use server";

// JC-1 — server actions for the managed techs list. Mirrors
// manufacturers-actions.ts: uniform ActionResult, reads open to authenticated
// callers, writes gated by requireAdmin (the canonical admin gate). The Techs
// pane is admin-only; labour writes (financials:edit) live elsewhere.

import { revalidatePath } from "next/cache";
import {
  listTechs,
  createTech,
  updateTech,
  deleteTech,
} from "@/lib/api/techs";
import { getCurrentProfile } from "@/lib/auth/profile";
import type { DbTech } from "@/lib/types/database";

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

// A blank / non-numeric rate clears the default (null). Negative is rejected.
function parseRate(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const t = String(raw).trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error("Cost rate must be a number.");
  if (n < 0) throw new Error("Cost rate can't be negative.");
  return n;
}

export async function listTechsAction(): Promise<ActionResult<DbTech[]>> {
  try {
    return { ok: true, data: await listTechs() };
  } catch (e) {
    return fail(e);
  }
}

export async function createTechAction(
  name: string,
  defaultCostRate?: string | null
): Promise<ActionResult<DbTech>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const trimmed = name.trim();
    if (trimmed === "") return { ok: false, error: "Name is required." };
    const row = await createTech(trimmed, parseRate(defaultCostRate));
    revalidate();
    return { ok: true, data: row };
  } catch (e) {
    return fail(e);
  }
}

export async function renameTechAction(
  id: string,
  name: string
): Promise<ActionResult<DbTech>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const trimmed = name.trim();
    if (trimmed === "") return { ok: false, error: "Name is required." };
    const row = await updateTech(id, { name: trimmed });
    revalidate();
    return { ok: true, data: row };
  } catch (e) {
    return fail(e);
  }
}

// Combined name + default-rate edit, so the pane's inline editor is one atomic
// round-trip instead of a rename + a set-rate race.
export async function editTechAction(
  id: string,
  name: string,
  defaultCostRate: string | null
): Promise<ActionResult<DbTech>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const trimmed = name.trim();
    if (trimmed === "") return { ok: false, error: "Name is required." };
    const row = await updateTech(id, {
      name: trimmed,
      default_cost_rate: parseRate(defaultCostRate),
    });
    revalidate();
    return { ok: true, data: row };
  } catch (e) {
    return fail(e);
  }
}

export async function setTechRateAction(
  id: string,
  defaultCostRate: string | null
): Promise<ActionResult<DbTech>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const row = await updateTech(id, { default_cost_rate: parseRate(defaultCostRate) });
    revalidate();
    return { ok: true, data: row };
  } catch (e) {
    return fail(e);
  }
}

export async function setTechActiveAction(
  id: string,
  isActive: boolean
): Promise<ActionResult<DbTech>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const row = await updateTech(id, { is_active: isActive });
    revalidate();
    return { ok: true, data: row };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTechAction(
  id: string
): Promise<ActionResult<{ deleted: boolean }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const deleted = await deleteTech(id);
    revalidate();
    return { ok: true, data: { deleted } };
  } catch (e) {
    return fail(e);
  }
}
