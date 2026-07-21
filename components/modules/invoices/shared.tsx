// INVOICE-1 — small presentation helpers shared by the invoice list, builder,
// and the project-detail invoices section.

/** opco → short entity label for the badge. */
export const OPCO_LABEL: Record<string, string> = {
  integrated_solutions: "Integrated",
  guardian: "Guardian",
};

/** Status → Tailwind classes (bg + text) for the status pill. */
export const STATUS_TONE: Record<string, string> = {
  draft:
    "bg-muted text-muted-foreground",
  sent: "bg-[color-mix(in_oklab,var(--brand-navy)_15%,transparent)] text-brand-navy",
  // FIN-2 — partially_paid: amber, between sent and paid.
  partially_paid:
    "bg-[color-mix(in_oklab,#C9A24B_22%,transparent)] text-[#8a6d1f]",
  paid: "bg-[color-mix(in_oklab,var(--brand-status-green)_18%,transparent)] text-[var(--brand-status-green)]",
  void: "bg-[color-mix(in_oklab,var(--destructive)_15%,transparent)] text-destructive",
};

/** FIN-2 — human label for a status value (handles the underscore form). */
export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  partially_paid: "Partially paid",
  paid: "Paid",
  void: "Void",
};
