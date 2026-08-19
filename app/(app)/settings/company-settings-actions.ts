"use server";
import { requireAdmin } from "@/lib/permissions/resolve";

// Chunk 2 — server actions for the company_settings store. Mirrors
// inventory-vocab-actions.ts: uniform ActionResult, reads open to authenticated
// callers, writes gated by requireAdmin.

import { revalidatePath } from "next/cache";
import {
  DEFAULT_TERMS_KEY,
  DEFAULT_TERMS_GUARDIAN_KEY,
  TIER_TEXT_KEYS,
  TIER_DISCRETION_DISCLAIMER_KEY,
  getSetting,
  setSetting,
  getTierTexts,
  getTierDiscretionDisclaimer,
  type TierLevel,
} from "@/lib/api/company-settings";
import {
  getPoSenderEmail,
  getPoSenderName,
  setPoSenderEmail,
  setPoSenderName,
} from "@/lib/settings/po-sender";
import {
  getWorkingCalendar,
  setWorkingCalendar,
  hasConfiguredCalendar,
} from "@/lib/settings/working-calendar-settings";
import type { WorkingCalendarConfig } from "@/lib/gantt/working-calendar";

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

// PO-3 — the "From" address used when emailing purchase orders to vendors.
// Read open (like the other getters); write is admin-gated. Mirrors
// setDefaultTermsAction; settings_audit_log is not wired here (the generic
// key-value setting panes don't audit — that surface is the T&C/LegalDoc editor
// via lib/api/settings-audit.ts).
export async function getPoSenderAction(): Promise<
  ActionResult<{ email: string; name: string }>
> {
  try {
    const [email, name] = await Promise.all([
      getPoSenderEmail(),
      getPoSenderName(),
    ]);
    return { ok: true, data: { email, name } };
  } catch (e) {
    return fail(e);
  }
}

export async function updatePoSenderAction(input: {
  email: string;
  name: string;
}): Promise<ActionResult<{ email: string; name: string }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    await setPoSenderEmail(input.email); // throws on invalid email
    await setPoSenderName(input.name);
    revalidatePath("/settings");
    return {
      ok: true,
      data: { email: input.email.trim(), name: input.name.trim() },
    };
  } catch (e) {
    return fail(e);
  }
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

// POLISH-5 — Prestige Tier description blocks. Read open (the invite/outcome
// emails read them server-side); write requireAdmin-gated.
export async function getTierTextsAction(): Promise<
  ActionResult<Record<TierLevel, string>>
> {
  try {
    return { ok: true, data: await getTierTexts() };
  } catch (e) {
    return fail(e);
  }
}

export async function setTierTextAction(
  level: TierLevel,
  value: string
): Promise<ActionResult<null>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const key = TIER_TEXT_KEYS[level];
    if (!key) return { ok: false, error: "Unknown tier." };
    await setSetting(key, value);
    revalidatePath("/settings");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

// POLISH-7 (CHANGE 5) — the Nexvelon-discretion disclaimer block.
export async function getTierDisclaimerAction(): Promise<ActionResult<string>> {
  try {
    return { ok: true, data: await getTierDiscretionDisclaimer() };
  } catch (e) {
    return fail(e);
  }
}

export async function setTierDisclaimerAction(
  value: string
): Promise<ActionResult<null>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    await setSetting(TIER_DISCRETION_DISCLAIMER_KEY, value);
    revalidatePath("/settings");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

// GANTT-CAL — the org working calendar (working weekdays + holidays) that drives
// scheduling. Read open (schedules read it); write requireAdmin-gated. `configured`
// distinguishes the seeded default from an explicit org choice (§2.8).
export async function getWorkingCalendarAction(): Promise<
  ActionResult<{ config: WorkingCalendarConfig; configured: boolean }>
> {
  try {
    const [config, configured] = await Promise.all([getWorkingCalendar(), hasConfiguredCalendar()]);
    return { ok: true, data: { config, configured } };
  } catch (e) {
    return fail(e);
  }
}

export async function setWorkingCalendarAction(
  config: WorkingCalendarConfig
): Promise<ActionResult<WorkingCalendarConfig>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const saved = await setWorkingCalendar(config); // validates; throws on nonsense
    revalidatePath("/settings");
    return { ok: true, data: saved };
  } catch (e) {
    return fail(e);
  }
}
