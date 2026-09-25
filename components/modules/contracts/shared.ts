// RECUR-1 — presentation helpers shared by the contracts list, detail, form, and
// the pending-drafts banner.

import type {
  ServiceContractCadence,
  ServiceContractBillingMode,
  ServiceContractBillingTiming,
} from "@/lib/types/database";

export const OPCO_OPTIONS: { value: string; label: string }[] = [
  { value: "integrated_solutions", label: "Integrated Solutions" },
  { value: "guardian", label: "Guardian" },
];
export const OPCO_LABEL: Record<string, string> = {
  integrated_solutions: "Integrated Solutions",
  guardian: "Guardian",
};

export const CADENCE_OPTIONS: { value: ServiceContractCadence; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly (every 3 months)" },
  { value: "semiannual", label: "Semi-annual (every 6 months)" },
  { value: "annual", label: "Annual" },
  { value: "custom", label: "Custom interval (days)" },
];
export const CADENCE_LABEL: Record<ServiceContractCadence, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  semiannual: "Semi-annual",
  annual: "Annual",
  custom: "Custom",
};

export const BILLING_MODE_OPTIONS: {
  value: ServiceContractBillingMode;
  label: string;
  help: string;
}[] = [
  {
    value: "draft_for_approval",
    label: "Draft for approval (default)",
    help: "On each billing date a DRAFT invoice is generated and waits for you to review and issue it.",
  },
  {
    value: "automatic",
    label: "Automatic",
    help: "On each billing date the invoice is generated AND issued immediately (a number is stamped, no review).",
  },
  {
    value: "manual",
    label: "Manual",
    help: "Nothing generates on a schedule; you create each invoice yourself with “Generate now”.",
  },
];
export const BILLING_MODE_LABEL: Record<ServiceContractBillingMode, string> = {
  draft_for_approval: "Draft for approval",
  automatic: "Automatic",
  manual: "Manual",
};

export const BILLING_TIMING_OPTIONS: {
  value: ServiceContractBillingTiming;
  label: string;
  help: string;
}[] = [
  { value: "advance", label: "In advance (default)", help: "Bill at the start of each period — typical for monitoring." },
  { value: "arrears", label: "In arrears", help: "Bill at the end of each period, for the period just elapsed." },
];

export const CONTRACT_STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-[color-mix(in_oklab,var(--brand-status-green)_18%,transparent)] text-[var(--brand-status-green)]",
  suspended: "bg-[color-mix(in_oklab,#C9A24B_22%,transparent)] text-[#8a6d1f]",
  cancelled: "bg-[color-mix(in_oklab,var(--destructive)_15%,transparent)] text-destructive",
  expired: "bg-muted text-muted-foreground",
};
