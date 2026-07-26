"use server";
import { requireAdmin } from "@/lib/permissions/resolve";

// PART-FIX-2 — server actions for the managed category tree. Mirrors
// manufacturers-actions.ts: reads open to authenticated callers, writes gated
// by requireAdmin.

import { revalidatePath } from "next/cache";
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/lib/api/categories";
import type { DbInventoryCategory } from "@/lib/types/database";

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

function revalidate() {
  revalidatePath("/settings");
  revalidatePath("/inventory");
}

export async function listCategoriesAction(): Promise<
  ActionResult<DbInventoryCategory[]>
> {
  try {
    return { ok: true, data: await listCategories() };
  } catch (e) {
    return fail(e);
  }
}

export async function createCategoryAction(
  name: string,
  parentId: string | null
): Promise<ActionResult<DbInventoryCategory>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const trimmed = name.trim();
    if (trimmed === "") return { ok: false, error: "Name is required." };
    const row = await createCategory(trimmed, parentId);
    revalidate();
    return { ok: true, data: row };
  } catch (e) {
    return fail(e);
  }
}

export async function renameCategoryAction(
  id: string,
  name: string
): Promise<ActionResult<DbInventoryCategory>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const trimmed = name.trim();
    if (trimmed === "") return { ok: false, error: "Name is required." };
    const row = await updateCategory(id, { name: trimmed });
    revalidate();
    return { ok: true, data: row };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCategoryAction(
  id: string
): Promise<ActionResult<{ deleted: boolean }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const deleted = await deleteCategory(id);
    revalidate();
    return { ok: true, data: { deleted } };
  } catch (e) {
    return fail(e);
  }
}
