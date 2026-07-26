"use server";

// INV-9-2 — cycle-count server actions. Counts are an inventory operation:
//   reads      → inventory:view
//   mutations  → inventory:edit
// (Mirrors app/(app)/inventory/actions.ts's adaptRole + hasPermission gating.)

import { revalidatePath } from "next/cache";
import {
  createCountSession,
  listCountSessions,
  getCountSession,
  getCountVarianceSummary,
  enterCount,
  submitForReview,
  applyCount,
  cancelCount,
  type ApplyCountResult,
  type CountVarianceSummary,
} from "@/lib/api/inventory-counts";
import { listStockLocations } from "@/lib/api/stock-locations";
import { listCategories } from "@/lib/api/categories";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission, type Action } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import type { DbCountLine, DbCountSession, DbRole } from "@/lib/types/database";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
  return { ok: false, error: message };
}

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

async function require(
  action: Action
): Promise<{ ok: true; actorId: string } | { ok: false; error: string }> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  if (!hasPermission(adaptRole(me.role), "inventory", action)) {
    return { ok: false, error: "You don't have permission to manage cycle counts." };
  }
  return { ok: true, actorId: me.id };
}

export async function listCountScopeOptionsAction(): Promise<
  ActionResult<{ locations: { id: string; name: string }[]; categories: { id: string; name: string }[] }>
> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    const [locs, cats] = await Promise.all([listStockLocations(), listCategories()]);
    return {
      ok: true,
      data: {
        locations: locs.map((l) => ({ id: l.id, name: l.name })),
        categories: cats.map((c) => ({ id: c.id, name: c.name })),
      },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function listCountSessionsAction(): Promise<ActionResult<DbCountSession[]>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await listCountSessions() };
  } catch (e) {
    return fail(e);
  }
}

export async function getCountSessionAction(sessionId: string): Promise<
  ActionResult<{ session: DbCountSession; lines: DbCountLine[]; summary: CountVarianceSummary }>
> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    const s = await getCountSession(sessionId);
    if (!s) return { ok: false, error: "Count session not found." };
    const summary = await getCountVarianceSummary(sessionId);
    return { ok: true, data: { ...s, summary } };
  } catch (e) {
    return fail(e);
  }
}

export async function createCountSessionAction(input: {
  locationId?: string | null;
  categoryId?: string | null;
  countedBy?: string | null;
  notes?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const session = await createCountSession({ ...input, actorId: gate.actorId });
    revalidatePath("/inventory");
    return { ok: true, data: { id: session.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function enterCountAction(
  lineId: string,
  countedQty: number | null
): Promise<ActionResult<{ ok: true }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    await enterCount({ lineId, countedQty, actorId: gate.actorId });
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return fail(e);
  }
}

export async function submitForReviewAction(
  sessionId: string
): Promise<ActionResult<{ ok: true }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    await submitForReview(sessionId, gate.actorId);
    revalidatePath("/inventory");
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return fail(e);
  }
}

export async function applyCountAction(
  sessionId: string
): Promise<ActionResult<ApplyCountResult>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const result = await applyCount({ sessionId, actorId: gate.actorId });
    revalidatePath("/inventory");
    return { ok: true, data: result };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelCountAction(
  sessionId: string
): Promise<ActionResult<{ ok: true }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    await cancelCount(sessionId, gate.actorId);
    revalidatePath("/inventory");
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return fail(e);
  }
}
