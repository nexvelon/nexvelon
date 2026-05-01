import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuoteStatus } from "@/lib/types";

const STYLES: Record<QuoteStatus, string> = {
  Draft: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  Sent: "bg-brand-navy/10 text-brand-navy ring-1 ring-brand-navy/15",
  Approved: "bg-brand-gold/15 text-amber-800 ring-1 ring-brand-gold/30",
  Rejected: "bg-red-50 text-red-700 ring-1 ring-red-200",
  Expired: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  Converted: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
};

export function QuoteStatusBadge({
  status,
  size = "sm",
}: {
  status: QuoteStatus;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium tracking-wide",
        size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]",
        STYLES[status]
      )}
    >
      {status === "Converted" && <Check className="h-3 w-3" />}
      {status}
    </span>
  );
}
