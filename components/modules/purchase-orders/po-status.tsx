// PO-3 — shared status presentation + transition-availability helpers, used by
// both the list (PurchaseOrdersView) and the drawer (PurchaseOrderFormDrawer).
// Mirrors PO_STATUS_TRANSITIONS in lib/api/purchase-orders.ts (kept in sync; the
// server is the source of truth and re-validates every transition).

import type { DbPurchaseOrderStatus } from "@/lib/types/database";

export const STATUS_BADGE: Record<
  DbPurchaseOrderStatus,
  { label: string; bg: string; text: string }
> = {
  draft: { label: "Draft", bg: "#E8E8EA", text: "#52525B" },
  issued: { label: "Issued", bg: "#DBEAFE", text: "#1E40AF" },
  partially_received: { label: "Partial", bg: "#FEF3C7", text: "#92400E" },
  received: { label: "Received", bg: "#DCFCE7", text: "#166534" },
  closed: { label: "Closed", bg: "#E0E7FF", text: "#3730A3" },
  cancelled: { label: "Cancelled", bg: "#FEE2E2", text: "#991B1B" },
};

export function StatusBadge({ status }: { status: DbPurchaseOrderStatus }) {
  const b = STATUS_BADGE[status];
  return (
    <span
      className="inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-bold"
      style={{ background: b.bg, color: b.text }}
    >
      {b.label}
    </span>
  );
}

/** Header/line editing is allowed only on a draft PO. */
export const isEditableStatus = (s: DbPurchaseOrderStatus): boolean =>
  s === "draft";

export const canIssue = (s: DbPurchaseOrderStatus): boolean => s === "draft";
export const canCancel = (s: DbPurchaseOrderStatus): boolean =>
  s === "draft" || s === "issued" || s === "partially_received";
export const canClose = (s: DbPurchaseOrderStatus): boolean =>
  s === "issued" || s === "partially_received" || s === "received";
/** Admin-only reopen (issued → draft). Caller also checks isAdmin. */
export const canReopen = (s: DbPurchaseOrderStatus): boolean => s === "issued";
/** Receiving is possible on an issued or partially_received PO. */
export const canReceive = (s: DbPurchaseOrderStatus): boolean =>
  s === "issued" || s === "partially_received";
