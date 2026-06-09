"use server";

// Chunk 2 — server actions for the company_settings store. Mirrors
// inventory-vocab-actions.ts: uniform ActionResult, reads open to authenticated
// callers, writes gated by requireAdmin.

import { revalidatePath } from "next/cache";
import {
  DEFAULT_TERMS_KEY,
  DEFAULT_TERMS_GUARDIAN_KEY,
  getSetting,
  setSetting,
} from "@/lib/api/company-settings";
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

export async function getDefaultTermsAction(): Promise<
  ActionResult<string | null>
> {
  try {
    return { ok: true, data: await getSetting(DEFAULT_TERMS_KEY) };
  } catch (e) {
    return fail(e);
  }
}

export async function setDefaultTermsAction(
  value: string
): Promise<ActionResult<null>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    await setSetting(DEFAULT_TERMS_KEY, value);
    revalidatePath("/settings");
    revalidatePath("/quotes/new");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

// G2 — Guardian default Terms (parallel to the Integrated actions above,
// keyed by DEFAULT_TERMS_GUARDIAN_KEY). Read open; write requireAdmin-gated.
export async function getDefaultTermsGuardianAction(): Promise<
  ActionResult<string | null>
> {
  try {
    return { ok: true, data: await getSetting(DEFAULT_TERMS_GUARDIAN_KEY) };
  } catch (e) {
    return fail(e);
  }
}

export async function setDefaultTermsGuardianAction(
  value: string
): Promise<ActionResult<null>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    await setSetting(DEFAULT_TERMS_GUARDIAN_KEY, value);
    revalidatePath("/settings");
    revalidatePath("/quotes/new");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}
