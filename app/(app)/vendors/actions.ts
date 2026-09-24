"use server";
import { can } from "@/lib/permissions/resolve";

// PO-1 — vendors server actions. Mirrors app/(app)/clients/actions.ts: uniform
// ActionResult, best-effort activity logging, computeChanges-driven update diff.
// Mutations are gated by hasPermission(role, "inventory", create|edit|delete).

import { revalidatePath } from "next/cache";
import {
  createVendor,
  deleteVendor,
  getVendorById,
  getVendors,
  updateVendor,
  revealVendorAccountNumber,
  type VendorRead,
} from "@/lib/api/vendors";
import { getVendorMetrics, type VendorMetrics } from "@/lib/api/vendor-metrics";
import { computeChanges, logActivity } from "@/lib/api/activity-log";
import { getCurrentProfile } from "@/lib/auth/profile";
import { isEncryptionConfigured } from "@/lib/crypto/credentials";
import { type Action } from "@/lib/permissions";
import type {
  DbVendorInsert,
  DbVendorUpdate,
} from "@/lib/types/database";

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

// Gate a mutation on inventory-resource permission. Returns null when allowed,
// or the uniform { ok:false } when not signed in / not permitted.
async function requireInventory(
  action: Action
): Promise<{ ok: false; error: string } | null> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  if (!(await can("inventory", action))) {
    return { ok: false, error: "You don't have permission to manage vendors." };
  }
  return null;
}

function validateVendorPayload(
  payload: DbVendorInsert | DbVendorUpdate
): { ok: false; error: string } | null {
  if ("name" in payload && (payload.name ?? "").trim() === "") {
    return { ok: false, error: "Vendor name is required." };
  }
  return null;
}

/** Read helper for the client view to refresh after a mutation (no gate).
 *  Credential-stripped (VendorRead) — never carries the account number. */
export async function listVendorsAction(): Promise<ActionResult<VendorRead[]>> {
  try {
    return { ok: true, data: await getVendors() };
  } catch (e) {
    return fail(e);
  }
}

export async function createVendorAction(
  payload: DbVendorInsert
): Promise<ActionResult<{ id: string }>> {
  try {
    const denied = await requireInventory("create");
    if (denied) return denied;
    const invalid = validateVendorPayload(payload);
    if (invalid) return invalid;

    const row = await createVendor(payload);
    await logActivity("vendor", row.id, "create", {});
    revalidatePath("/vendors");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateVendorAction(
  id: string,
  payload: DbVendorUpdate
): Promise<ActionResult<{ id: string }>> {
  try {
    const denied = await requireInventory("edit");
    if (denied) return denied;
    const invalid = validateVendorPayload(payload);
    if (invalid) return invalid;

    const before = await getVendorById(id);
    if (!before) return { ok: false, error: "Vendor not found" };

    const row = await updateVendor(id, payload);

    // SEC-2 — NEVER let the plaintext account number reach the activity log.
    // Diff everything EXCEPT account_number; record a value-free marker when the
    // banking credential was changed.
    const { account_number: acctChange, ...auditPayload } = payload as {
      account_number?: string | null;
    } & Record<string, unknown>;
    const changes = computeChanges(
      before as unknown as Record<string, unknown>,
      auditPayload as Record<string, unknown>
    );
    if (acctChange !== undefined) {
      const hadValue = before.has_account_number;
      const hasValue = acctChange != null && acctChange !== "";
      if (hadValue !== hasValue || hasValue) {
        changes.account_number = {
          from: hadValue ? "••••" : null,
          to: hasValue ? "••••" : null,
        };
      }
    }
    if (Object.keys(changes).length > 0) {
      await logActivity("vendor", id, "update", changes, {
        entityLabel: before.name,
      });
    }

    revalidatePath("/vendors");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * SEC-2 — reveal ONE vendor's decrypted account number on explicit action.
 * Gated on financials:view (banking is financial data), never bulk, server-side
 * only. Audit-on-read: a successful reveal writes an activity row naming the
 * vendor — never the value. Fail-closed: any decryption/config failure returns a
 * clean error so the UI keeps the masked state and never shows plaintext.
 */
export async function revealVendorAccountNumberAction(
  id: string
): Promise<ActionResult<{ value: string | null }>> {
  try {
    const me = await getCurrentProfile();
    if (!me || !(await can("financials", "view"))) {
      return { ok: false, error: "You don't have permission to view banking details." };
    }
    if (!isEncryptionConfigured()) {
      return { ok: false, error: "Credential encryption is not configured." };
    }
    const vendor = await getVendorById(id);
    if (!vendor) return { ok: false, error: "Vendor not found" };

    let value: string | null;
    try {
      value = await revealVendorAccountNumber(id);
    } catch {
      // Decryption failed (bad key / tampered ciphertext) — stay masked.
      return { ok: false, error: "Couldn't decrypt this credential." };
    }

    if (value != null) {
      // Audit-on-read (§4.2 dim 7): who revealed the banking credential + which
      // vendor. NEVER the value. "update" is the closest fit in the strict
      // create|update|delete action union; a dedicated read action is a follow-up.
      await logActivity(
        "vendor",
        id,
        "update",
        { account_number_revealed: { from: null, to: "(revealed)" } },
        { entityLabel: vendor.name }
      );
    }
    return { ok: true, data: { value } };
  } catch (e) {
    return fail(e);
  }
}

// INV-9-1 — vendor performance metrics. Cost-side (spend) fields are redacted
// to null for callers without financials:view, mirroring how the cost rollup
// redacts its financial legs — defense-in-depth so figures never reach a client
// that shouldn't see them. Operational metrics (on-time, lead time, fill rate,
// part quantities) stay visible to anyone with inventory:view.
export type VendorMetricsView = Omit<
  VendorMetrics,
  "ytd_spend" | "spend_by_month" | "price_variance" | "top_parts"
> & {
  ytd_spend: number | null;
  spend_by_month: { month: number; amount: number | null }[];
  price_variance: { pct: number | null; amount: number | null; matched_pos: number };
  top_parts: { product_id: string; name: string; qty: number; spend: number | null }[];
};

function redactSpend(m: VendorMetrics): VendorMetricsView {
  return {
    ...m,
    ytd_spend: null,
    spend_by_month: m.spend_by_month.map((x) => ({ month: x.month, amount: null })),
    price_variance: { pct: null, amount: null, matched_pos: m.price_variance.matched_pos },
    top_parts: m.top_parts.map((p) => ({ ...p, spend: null })),
  };
}

/**
 * INV-9-1 — read a vendor's performance metrics. Gate: inventory:view (the same
 * tier vendor reads ride today). Spend figures additionally require
 * financials:view; when absent they come back null and the UI shows the
 * operational metrics only.
 */
export async function getVendorMetricsAction(
  vendorId: string,
  year?: number
): Promise<ActionResult<{ metrics: VendorMetricsView; canSeeSpend: boolean }>> {
  try {
    const me = await getCurrentProfile();
    if (!me) return { ok: false, error: "You're not signed in." };
    if (!(await can("inventory", "view"))) {
      return { ok: false, error: "You don't have permission to view vendors." };
    }
    const canSeeSpend = await can("financials", "view");
    const metrics = await getVendorMetrics(vendorId, { year });
    return {
      ok: true,
      data: { metrics: canSeeSpend ? metrics : redactSpend(metrics), canSeeSpend },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteVendorAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const denied = await requireInventory("delete");
    if (denied) return denied;

    const removed = await deleteVendor(id);
    if (!removed) return { ok: false, error: "Vendor not found" };

    await logActivity("vendor", id, "delete", {});
    revalidatePath("/vendors");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}
