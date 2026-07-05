// INV-4 — shared, client-safe label maps + option lists for the RMA UI.

import type { DbRmaReason, DbRmaStatus } from "@/lib/types/database";

export const RMA_REASON_OPTIONS: { value: DbRmaReason; label: string }[] = [
  { value: "defective", label: "Defective" },
  { value: "wrong_part", label: "Wrong part" },
  { value: "over_shipment", label: "Over-shipment" },
  { value: "warranty", label: "Warranty" },
  { value: "other", label: "Other" },
];

export const RMA_REASON_LABEL: Record<DbRmaReason, string> = {
  defective: "Defective",
  wrong_part: "Wrong part",
  over_shipment: "Over-shipment",
  warranty: "Warranty",
  other: "Other",
};

export const RMA_STATUS_LABEL: Record<DbRmaStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  approved: "Approved",
  shipped: "Shipped",
  received_credit: "Credit received",
  closed: "Closed",
  cancelled: "Cancelled",
};

// Tailwind classes for a status chip (tone by lifecycle stage).
export const RMA_STATUS_TONE: Record<DbRmaStatus, string> = {
  draft: "bg-muted text-foreground/70",
  sent: "bg-blue-100 text-blue-700",
  approved: "bg-indigo-100 text-indigo-700",
  shipped: "bg-amber-100 text-amber-700",
  received_credit: "bg-emerald-100 text-emerald-700",
  closed: "bg-brand-navy/10 text-brand-navy",
  cancelled: "bg-red-100 text-red-700",
};

export const RMA_CARRIER_OPTIONS: { value: string; label: string }[] = [
  { value: "ups", label: "UPS" },
  { value: "fedex", label: "FedEx" },
  { value: "purolator", label: "Purolator" },
  { value: "other", label: "Other" },
];
