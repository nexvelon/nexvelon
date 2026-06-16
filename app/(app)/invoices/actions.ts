"use server";

// INVOICE-1 — invoicing server actions. Reads are RLS-gated (authenticated
// SELECT). Mutations are financial-sensitive, so they require the existing
// `financials` edit permission (Admin + Accountant) — reused rather than a new
// isAdmin gate, since permissions.ts already models financials access.

import { revalidatePath } from "next/cache";
import {
  listInvoices,
  getInvoiceById,
  listInvoicesForProject,
  listInvoicesForProduct,
  listBillableMaterialsForProject,
  createInvoiceForProject,
  addManualLine,
  addCostCenterLine,
  addMaterialLine,
  updateLine,
  unlinkLine,
  deleteLine,
  recomputeTotals,
  setTaxRate,
  setTaxExempt,
  setHoldbackRate,
  setDueDate,
  setNotes,
  setLineIdentifierFields,
  issueInvoice,
  setInvoiceStatus,
  type InvoiceListRow,
  type InvoiceDetail,
  type InvoiceMutationResult,
  type ManualLineInput,
  type MaterialLineInput,
  type LineUpdateInput,
  type BillableMaterialGroup,
} from "@/lib/api/invoices";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import type { DbInvoice, DbRole } from "@/lib/types/database";
import type { Role } from "@/lib/types";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

// DbRole (11) → app Role (7) for hasPermission; mirrors the projects/inventory
// action helpers.
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

// Financial-sensitive: only roles with `financials` edit (Admin, Accountant).
async function requireFinancials(): Promise<string | null> {
  const me = await getCurrentProfile();
  if (!me || !hasPermission(adaptRole(me.role), "financials", "edit")) {
    return "You don't have permission to manage invoices.";
  }
  return null;
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listInvoicesAction(): Promise<InvoiceListRow[]> {
  return listInvoices();
}

export async function getInvoiceByIdAction(
  id: string
): Promise<InvoiceDetail | null> {
  return getInvoiceById(id);
}

export async function listInvoicesForProjectAction(
  projectId: string
): Promise<InvoiceListRow[]> {
  if (!projectId) return [];
  return listInvoicesForProject(projectId);
}

// MATERIALS-1 — invoices that bill a part (part detail's Invoices section).
export async function listInvoicesForProductAction(
  productId: string
): Promise<InvoiceListRow[]> {
  if (!productId) return [];
  return listInvoicesForProduct(productId);
}

// MATERIALS-1 — a project's billable parts grouped by part × cost-center.
export async function listBillableMaterialsForProjectAction(
  projectId: string
): Promise<BillableMaterialGroup[]> {
  if (!projectId) return [];
  return listBillableMaterialsForProject(projectId);
}

// ─── Create ────────────────────────────────────────────────────────────────

export async function createInvoiceForProjectAction(
  projectId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const denied = await requireFinancials();
    if (denied) return { ok: false, error: denied };
    const invoice = await createInvoiceForProject(projectId);
    revalidatePath("/invoices");
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, data: { id: invoice.id } };
  } catch (e) {
    return fail(e);
  }
}

// ─── Line ops ────────────────────────────────────────────────────────────────

function revalidateInvoice(id: string) {
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
}

export async function addManualLineAction(
  invoiceId: string,
  input?: ManualLineInput
): Promise<ActionResult<InvoiceMutationResult>> {
  try {
    const denied = await requireFinancials();
    if (denied) return { ok: false, error: denied };
    const res = await addManualLine(invoiceId, input);
    revalidateInvoice(invoiceId);
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

export async function addCostCenterLineAction(
  invoiceId: string,
  costCenterId: string,
  pct = 100
): Promise<ActionResult<InvoiceMutationResult>> {
  try {
    const denied = await requireFinancials();
    if (denied) return { ok: false, error: denied };
    const res = await addCostCenterLine(invoiceId, costCenterId, pct);
    revalidateInvoice(invoiceId);
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

export async function addMaterialLineAction(
  invoiceId: string,
  input: MaterialLineInput
): Promise<ActionResult<InvoiceMutationResult>> {
  try {
    const denied = await requireFinancials();
    if (denied) return { ok: false, error: denied };
    const res = await addMaterialLine(invoiceId, input);
    revalidateInvoice(invoiceId);
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

export async function setLineIdentifierFieldsAction(
  invoiceId: string,
  fields: string[]
): Promise<ActionResult<InvoiceMutationResult>> {
  try {
    const denied = await requireFinancials();
    if (denied) return { ok: false, error: denied };
    const res = await setLineIdentifierFields(invoiceId, fields);
    revalidateInvoice(invoiceId);
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

export async function updateLineAction(
  invoiceId: string,
  lineId: string,
  patch: LineUpdateInput
): Promise<ActionResult<InvoiceMutationResult>> {
  try {
    const denied = await requireFinancials();
    if (denied) return { ok: false, error: denied };
    const res = await updateLine(invoiceId, lineId, patch);
    revalidateInvoice(invoiceId);
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

export async function unlinkLineAction(
  invoiceId: string,
  lineId: string
): Promise<ActionResult<InvoiceMutationResult>> {
  try {
    const denied = await requireFinancials();
    if (denied) return { ok: false, error: denied };
    const res = await unlinkLine(invoiceId, lineId);
    revalidateInvoice(invoiceId);
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteLineAction(
  invoiceId: string,
  lineId: string
): Promise<ActionResult<InvoiceMutationResult>> {
  try {
    const denied = await requireFinancials();
    if (denied) return { ok: false, error: denied };
    const res = await deleteLine(invoiceId, lineId);
    revalidateInvoice(invoiceId);
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

// ─── Header settings ─────────────────────────────────────────────────────────

export async function setTaxRateAction(
  invoiceId: string,
  taxRate: number
): Promise<ActionResult<InvoiceMutationResult>> {
  try {
    const denied = await requireFinancials();
    if (denied) return { ok: false, error: denied };
    const res = await setTaxRate(invoiceId, taxRate);
    revalidateInvoice(invoiceId);
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

export async function setTaxExemptAction(
  invoiceId: string,
  exempt: boolean
): Promise<ActionResult<InvoiceMutationResult>> {
  try {
    const denied = await requireFinancials();
    if (denied) return { ok: false, error: denied };
    const res = await setTaxExempt(invoiceId, exempt);
    revalidateInvoice(invoiceId);
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

export async function setHoldbackRateAction(
  invoiceId: string,
  holdbackRate: number
): Promise<ActionResult<InvoiceMutationResult>> {
  try {
    const denied = await requireFinancials();
    if (denied) return { ok: false, error: denied };
    const res = await setHoldbackRate(invoiceId, holdbackRate);
    revalidateInvoice(invoiceId);
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

export async function setDueDateAction(
  invoiceId: string,
  dueDate: string | null
): Promise<ActionResult<InvoiceMutationResult>> {
  try {
    const denied = await requireFinancials();
    if (denied) return { ok: false, error: denied };
    const res = await setDueDate(invoiceId, dueDate);
    revalidateInvoice(invoiceId);
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

export async function setNotesAction(
  invoiceId: string,
  notes: string
): Promise<ActionResult<InvoiceMutationResult>> {
  try {
    const denied = await requireFinancials();
    if (denied) return { ok: false, error: denied };
    const res = await setNotes(invoiceId, notes);
    revalidateInvoice(invoiceId);
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

// ─── Issue + status ──────────────────────────────────────────────────────────

export async function issueInvoiceAction(
  id: string
): Promise<ActionResult<DbInvoice>> {
  try {
    const denied = await requireFinancials();
    if (denied) return { ok: false, error: denied };
    const invoice = await issueInvoice(id);
    revalidateInvoice(id);
    return { ok: true, data: invoice };
  } catch (e) {
    return fail(e);
  }
}

export async function setInvoiceStatusAction(
  id: string,
  status: "sent" | "paid" | "void"
): Promise<ActionResult<DbInvoice>> {
  try {
    const denied = await requireFinancials();
    if (denied) return { ok: false, error: denied };
    const invoice = await setInvoiceStatus(id, status);
    revalidateInvoice(id);
    return { ok: true, data: invoice };
  } catch (e) {
    return fail(e);
  }
}

// Keep recomputeTotals reachable for any future server flow that mutates lines
// outside these actions (e.g. a bulk import). Currently unused by the UI.
export async function recomputeTotalsAction(
  invoiceId: string
): Promise<ActionResult<DbInvoice>> {
  try {
    const denied = await requireFinancials();
    if (denied) return { ok: false, error: denied };
    const invoice = await recomputeTotals(invoiceId);
    revalidateInvoice(invoiceId);
    return { ok: true, data: invoice };
  } catch (e) {
    return fail(e);
  }
}
