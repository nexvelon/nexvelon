"use server";
import { can } from "@/lib/permissions/resolve";

// RECUR-1 — service-contract server actions. Gating (reuses existing keys — no new
// permission dimension): READS require clients:view (contracts are client/site
// commercial records), MUTATIONS require financials:edit (they produce invoices —
// the same authority that gates the invoice module). MRR + pending drafts are
// financial views → financials:view.

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import {
  listServiceContracts,
  listServiceContractsForClient,
  listServiceContractsForSite,
  getServiceContract,
  createServiceContract,
  updateServiceContract,
  setServiceContractStatus,
  getRecurringRevenue,
  listPendingContractDrafts,
  type ServiceContractRow,
  type ServiceContractDetail,
  type ServiceContractInput,
  type RecurringRevenue,
  type PendingContractDraft,
} from "@/lib/api/service-contracts";
import { generateDueContractInvoices, type GenerateResult } from "@/lib/recurring/generate";
import { issueInvoice } from "@/lib/api/invoices";
import { logActivity, computeChanges } from "@/lib/api/activity-log";
import { getCurrentProfile } from "@/lib/auth/profile";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

async function requireContractsView(): Promise<string | null> {
  const me = await getCurrentProfile();
  if (!me || !(await can("clients", "view"))) {
    return "You don't have permission to view service contracts.";
  }
  return null;
}

async function requireContractsManage(): Promise<
  { ok: true; actorId: string } | { ok: false; error: string }
> {
  const me = await getCurrentProfile();
  if (!me || !(await can("financials", "edit"))) {
    return { ok: false, error: "You don't have permission to manage service contracts." };
  }
  return { ok: true, actorId: me.id };
}

function validate(input: ServiceContractInput): string | null {
  if (!input.name?.trim()) return "A contract name is required.";
  if (!input.opco?.trim()) return "An operating company (opco) is required.";
  if (!input.clientId) return "A client is required.";
  if (!input.startDate) return "A start date is required.";
  if (input.cadence === "custom" && (!input.customIntervalDays || input.customIntervalDays <= 0)) {
    return "A custom cadence needs an interval of 1 or more days.";
  }
  if (!input.lines || input.lines.length === 0) return "Add at least one pricing line.";
  for (const l of input.lines) {
    if (!l.description?.trim()) return "Every pricing line needs a description.";
    if (!Number.isFinite(l.amount) || l.amount < 0) return "Every line needs a valid amount.";
  }
  return null;
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listContractsAction(): Promise<ActionResult<ServiceContractRow[]>> {
  try {
    const denied = await requireContractsView();
    if (denied) return { ok: false, error: denied };
    return { ok: true, data: await listServiceContracts() };
  } catch (e) {
    return fail(e);
  }
}

export async function listContractsForClientAction(
  clientId: string
): Promise<ActionResult<ServiceContractRow[]>> {
  try {
    const denied = await requireContractsView();
    if (denied) return { ok: false, error: denied };
    if (!clientId) return { ok: true, data: [] };
    return { ok: true, data: await listServiceContractsForClient(clientId) };
  } catch (e) {
    return fail(e);
  }
}

export async function listContractsForSiteAction(
  siteId: string
): Promise<ActionResult<ServiceContractRow[]>> {
  try {
    const denied = await requireContractsView();
    if (denied) return { ok: false, error: denied };
    if (!siteId) return { ok: true, data: [] };
    return { ok: true, data: await listServiceContractsForSite(siteId) };
  } catch (e) {
    return fail(e);
  }
}

export async function getContractAction(
  id: string
): Promise<ActionResult<ServiceContractDetail | null>> {
  try {
    const denied = await requireContractsView();
    if (denied) return { ok: false, error: denied };
    return { ok: true, data: await getServiceContract(id) };
  } catch (e) {
    return fail(e);
  }
}

export async function getRecurringRevenueAction(): Promise<ActionResult<RecurringRevenue>> {
  try {
    const me = await getCurrentProfile();
    if (!me || !(await can("financials", "view"))) {
      return { ok: false, error: "You don't have permission to view recurring revenue." };
    }
    return { ok: true, data: await getRecurringRevenue() };
  } catch (e) {
    return fail(e);
  }
}

export async function listPendingDraftsAction(): Promise<ActionResult<PendingContractDraft[]>> {
  try {
    const me = await getCurrentProfile();
    if (!me || !(await can("financials", "view"))) {
      return { ok: false, error: "You don't have permission to view pending invoices." };
    }
    return { ok: true, data: await listPendingContractDrafts() };
  } catch (e) {
    return fail(e);
  }
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function createContractAction(
  input: ServiceContractInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireContractsManage();
    if (!gate.ok) return gate;
    const invalid = validate(input);
    if (invalid) return { ok: false, error: invalid };
    const row = await createServiceContract(input, gate.actorId);
    await logActivity("service_contract", row.id, "create", {}, {
      entityLabel: row.name,
      parentType: "client",
      parentId: row.client_id,
    });
    revalidatePath("/contracts");
    revalidatePath(`/clients/${input.clientId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateContractAction(
  id: string,
  input: ServiceContractInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireContractsManage();
    if (!gate.ok) return gate;
    const invalid = validate(input);
    if (invalid) return { ok: false, error: invalid };
    const before = await getServiceContract(id);
    if (!before) return { ok: false, error: "Contract not found." };
    const row = await updateServiceContract(id, input, gate.actorId);
    // Diff header fields only (lines are replaced wholesale; the value change is
    // captured as a marker, never a raw dump).
    const changes = computeChanges(
      {
        name: before.contract.name,
        cadence: before.contract.cadence,
        billing_mode: before.contract.billing_mode,
        billing_timing: before.contract.billing_timing,
        start_date: before.contract.start_date,
        end_date: before.contract.end_date,
      } as Record<string, unknown>,
      {
        name: input.name,
        cadence: input.cadence,
        billing_mode: input.billingMode,
        billing_timing: input.billingTiming,
        start_date: input.startDate,
        end_date: input.endDate ?? null,
      } as Record<string, unknown>
    );
    if (Object.keys(changes).length > 0) {
      await logActivity("service_contract", id, "update", changes, {
        entityLabel: row.name,
        parentType: "client",
        parentId: row.client_id,
      });
    }
    revalidatePath("/contracts");
    revalidatePath(`/contracts/${id}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function setContractStatusAction(
  id: string,
  status: "draft" | "active" | "suspended" | "cancelled" | "expired"
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireContractsManage();
    if (!gate.ok) return gate;
    const before = await getServiceContract(id);
    if (!before) return { ok: false, error: "Contract not found." };
    const row = await setServiceContractStatus(id, status, gate.actorId);
    await logActivity(
      "service_contract",
      id,
      "update",
      { status: { from: before.contract.status, to: status } },
      { entityLabel: row.name, parentType: "client", parentId: row.client_id }
    );
    revalidatePath("/contracts");
    revalidatePath(`/contracts/${id}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

/** Operator "generate now" — bills every currently-due period for ONE contract
 *  (any billing mode, including manual). Idempotent; safe to click twice. */
export async function generateNowAction(
  contractId: string
): Promise<ActionResult<GenerateResult>> {
  try {
    const gate = await requireContractsManage();
    if (!gate.ok) return gate;
    const supabase = (await createSupabaseServerClient()) as unknown as SupabaseClient;
    const result = await generateDueContractInvoices(supabase, {
      contractId,
      includeManual: true,
      actorId: gate.actorId,
    });
    revalidatePath("/contracts");
    revalidatePath(`/contracts/${contractId}`);
    revalidatePath("/invoices");
    return { ok: true, data: result };
  } catch (e) {
    return fail(e);
  }
}

/** Issue a draft invoice generated by a draft_for_approval contract. */
export async function issueContractDraftAction(
  invoiceId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireContractsManage();
    if (!gate.ok) return gate;
    const inv = await issueInvoice(invoiceId);
    revalidatePath("/contracts");
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${invoiceId}`);
    return { ok: true, data: { id: inv.id } };
  } catch (e) {
    return fail(e);
  }
}
