"use server";

// QUOTE-LABOUR — server actions for the app_settings key/value store. Reads are
// open to authenticated callers (the quote builder reads the default labour
// sell rate); the write is gated by requireAdmin (the Settings → Labour pane).

import { revalidatePath } from "next/cache";
import { getNumericSetting, setNumericSetting } from "@/lib/api/app-settings";
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

export async function getNumericSettingAction(
  key: string
): Promise<ActionResult<number | null>> {
  try {
    return { ok: true, data: await getNumericSetting(key) };
  } catch (e) {
    return fail(e);
  }
}

export async function setNumericSettingAction(
  key: string,
  value: number
): Promise<ActionResult<number>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    if (!Number.isFinite(value) || value < 0)
      return { ok: false, error: "Enter a non-negative number." };
    const saved = await setNumericSetting(key, value);
    revalidatePath("/settings");
    return { ok: true, data: saved };
  } catch (e) {
    return fail(e);
  }
}
