"use client";

// INV-5 — header button that emails the signed-in user a low-stock report
// (items at/under their reorder point). On-demand only; no cron/digest.

import { useTransition } from "react";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { emailLowStockReportAction } from "@/app/(app)/inventory/actions";

export function EmailLowStockButton() {
  const [pending, start] = useTransition();

  function handleClick() {
    start(async () => {
      const result = await emailLowStockReportAction();
      if (result.sent) {
        toast.success(
          `Emailed ${result.count} low-stock item${
            result.count === 1 ? "" : "s"
          } to ${result.to}`
        );
      } else {
        toast(result.reason ?? "Nothing to send");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3.5 py-2 text-[12px] font-medium tracking-wide hover:bg-muted/40 disabled:opacity-50"
      style={{ borderColor: "var(--brand-border)", color: "var(--brand-text)" }}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Mail className="h-3.5 w-3.5" />
      )}
      Email low-stock report
    </button>
  );
}
