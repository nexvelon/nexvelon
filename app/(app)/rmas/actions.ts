"use server";

// INV-4 — server actions for the RMA flow. Writes gate on inventory:edit,
// reads on inventory:view (mirrors the inventory/PO action posture). The
// send-to-vendor pipeline mirrors PO-4: the status transition is atomic, while
// PDF render / upload / email are best-effort (failures surface as a warning,
// not an error).

import { revalidatePath } from "next/cache";
import {
  createRma,
  markRmaShipped,
  markRmaCredited,
  closeRma,
  cancelRma,
  buildRmaPdfProps,
  getRmaById,
  listRmas,
  searchReturnableStock,
  stampRmaSent,
  setRmaPdfPath,
  type CreateRmaInput,
  type RmaListRow,
  type ReturnableStockRow,
} from "@/lib/api/rmas";
import { getVendors, getVendorById } from "@/lib/api/vendors";
import { renderRmaPdf } from "@/lib/pdf/render-rma";
import { uploadRmaPdf } from "@/lib/storage/rma-pdfs";
import { sendRmaEmail } from "@/lib/auth/email";
import { getPoSenderFrom } from "@/lib/settings/po-sender";
import { logActivity } from "@/lib/api/activity-log";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import type { DbRole, DbVendor } from "@/lib/types/database";
import type { Role } from "@/lib/types";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  return { ok: false, error: err instanceof Error ? err.message : String(err) };
}

// DbRole (11) → app Role (7); mirrors the inventory / movement action helpers.
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

async function requireInventoryEdit(): Promise<string | null> {
  const me = await getCurrentProfile();
  if (!me || !hasPermission(adaptRole(me.role), "inventory", "edit")) {
    return "You don't have permission to manage RMAs.";
  }
  return null;
}

async function requireInventoryView(): Promise<string | null> {
  const me = await getCurrentProfile();
  if (!me || !hasPermission(adaptRole(me.role), "inventory", "view")) {
    return "You don't have permission to view RMAs.";
  }
  return null;
}

// ── Reads (for the create dialog / list) ─────────────────────────────────────

export async function listVendorsForRmaAction(): Promise<DbVendor[]> {
  return getVendors();
}

export async function searchReturnableStockAction(
  query: string
): Promise<ActionResult<ReturnableStockRow[]>> {
  try {
    const denied = await requireInventoryView();
    if (denied) return { ok: false, error: denied };
    return { ok: true, data: await searchReturnableStock(query) };
  } catch (e) {
    return fail(e);
  }
}

export async function listRmasAction(): Promise<RmaListRow[]> {
  return listRmas();
}

// ── Writes ───────────────────────────────────────────────────────────────────

export async function createRmaAction(
  input: CreateRmaInput
): Promise<ActionResult<{ rmaId: string; rmaNumber: string }>> {
  try {
    const denied = await requireInventoryEdit();
    if (denied) return { ok: false, error: denied };
    const res = await createRma(input);
    await logActivity("rma", res.rmaId, "create", {
      rma_number: { from: null, to: res.rmaNumber },
      vendor: { from: null, to: input.vendorId },
    });
    revalidatePath("/rmas");
    revalidatePath("/inventory");
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

// Preview: render + upload without changing status. Returns a signed URL.
export async function previewRmaPdfAction(
  rmaId: string
): Promise<ActionResult<{ signedUrl: string | null }>> {
  try {
    const denied = await requireInventoryView();
    if (denied) return { ok: false, error: denied };
    const props = await buildRmaPdfProps(rmaId);
    const pdf = await renderRmaPdf(props);
    const up = await uploadRmaPdf(rmaId, props.rma.rma_number, pdf);
    await setRmaPdfPath(rmaId, up.path);
    return { ok: true, data: { signedUrl: up.signedUrl } };
  } catch (e) {
    return fail(e);
  }
}

export async function sendRmaToVendorAction(
  rmaId: string
): Promise<
  ActionResult<{ signedUrl: string | null; emailId: string | null; warning?: string }>
> {
  try {
    const denied = await requireInventoryEdit();
    if (denied) return { ok: false, error: denied };

    const detail = await getRmaById(rmaId);
    if (!detail) return { ok: false, error: "RMA not found." };
    if (detail.header.status !== "draft" && detail.header.status !== "sent") {
      return {
        ok: false,
        error: `Only a draft or sent RMA can be sent (is ${detail.header.status}).`,
      };
    }

    // Recipient must exist BEFORE any state change (mirrors PO-4).
    const vendor = await getVendorById(detail.header.vendor_id);
    if (!vendor) return { ok: false, error: "Vendor not found." };
    const recipientEmail = vendor.sales_rep_email ?? vendor.email;
    if (!recipientEmail) {
      return {
        ok: false,
        error:
          "This vendor has no sales rep email or general email. Add one before sending.",
      };
    }

    // Best-effort artifacts.
    const warnings: string[] = [];
    let pdfPath: string | null = null;
    let signedUrl: string | null = null;
    let emailId: string | null = null;

    try {
      const props = await buildRmaPdfProps(rmaId);
      const pdf = await renderRmaPdf(props);
      try {
        const up = await uploadRmaPdf(rmaId, props.rma.rma_number, pdf);
        pdfPath = up.path;
        signedUrl = up.signedUrl;
      } catch (err) {
        warnings.push(`PDF upload failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      try {
        const from = await getPoSenderFrom();
        const sent = await sendRmaEmail({
          to: recipientEmail,
          from,
          rmaNumber: props.rma.rma_number,
          vendorName: vendor.name,
          salesRepName: vendor.sales_rep_name,
          pdfBuffer: pdf,
          pdfFilename: `RMA_${props.rma.rma_number}.pdf`,
        });
        emailId = sent.id;
      } catch (err) {
        warnings.push(`Email send failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } catch (err) {
      warnings.push(`PDF render failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Atomic transition (always succeeds even if artifacts failed).
    await stampRmaSent(rmaId, { pdfPath, sentToEmail: recipientEmail });
    await logActivity("rma", rmaId, "update", {
      status: { from: detail.header.status, to: "sent" },
      sent_to: { from: null, to: recipientEmail },
    });

    revalidatePath("/rmas");
    revalidatePath(`/rmas/${rmaId}`);
    return {
      ok: true,
      data: { signedUrl, emailId, warning: warnings.length ? warnings.join("; ") : undefined },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function markRmaShippedAction(
  rmaId: string,
  trackingCarrier: string | null,
  trackingNumber: string | null
): Promise<ActionResult<null>> {
  try {
    const denied = await requireInventoryEdit();
    if (denied) return { ok: false, error: denied };
    await markRmaShipped({ rmaId, trackingCarrier, trackingNumber });
    await logActivity("rma", rmaId, "update", {
      status: { from: null, to: "shipped" },
      tracking: { from: null, to: [trackingCarrier, trackingNumber].filter(Boolean).join(" ") || null },
    });
    revalidatePath("/rmas");
    revalidatePath(`/rmas/${rmaId}`);
    revalidatePath("/inventory");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function markRmaCreditedAction(
  rmaId: string,
  creditReceivedAmount: number
): Promise<ActionResult<null>> {
  try {
    const denied = await requireInventoryEdit();
    if (denied) return { ok: false, error: denied };
    await markRmaCredited({ rmaId, creditReceivedAmount });
    await logActivity("rma", rmaId, "update", {
      status: { from: "shipped", to: "received_credit" },
      credit: { from: null, to: creditReceivedAmount },
    });
    revalidatePath("/rmas");
    revalidatePath(`/rmas/${rmaId}`);
    revalidatePath("/inventory");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function closeRmaAction(rmaId: string): Promise<ActionResult<null>> {
  try {
    const denied = await requireInventoryEdit();
    if (denied) return { ok: false, error: denied };
    await closeRma(rmaId);
    await logActivity("rma", rmaId, "update", {
      status: { from: "received_credit", to: "closed" },
    });
    revalidatePath("/rmas");
    revalidatePath(`/rmas/${rmaId}`);
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelRmaAction(rmaId: string): Promise<ActionResult<null>> {
  try {
    const denied = await requireInventoryEdit();
    if (denied) return { ok: false, error: denied };
    await cancelRma(rmaId);
    await logActivity("rma", rmaId, "update", {
      status: { from: null, to: "cancelled" },
    });
    revalidatePath("/rmas");
    revalidatePath(`/rmas/${rmaId}`);
    revalidatePath("/inventory");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}
