import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Quote } from "@/lib/types";
import type { ReadOnlyState } from "@/lib/use-read-only";

interface Props {
  state: ReadOnlyState;
  quote?: Quote;
}

export function ReadOnlyBanner({ state, quote }: Props) {
  if (!state.readOnly) return null;
  const isStatus = state.reason === "status";
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md border px-4 py-3 text-sm shadow-sm",
        isStatus
          ? "border-amber-300 bg-amber-50 text-amber-900"
          : "border-slate-300 bg-slate-50 text-slate-700"
      )}
    >
      <Lock
        className={cn("mt-0.5 h-4 w-4", isStatus ? "text-amber-600" : "text-slate-500")}
      />
      <div className="space-y-0.5">
        <p className="font-medium">Read-only</p>
        <p className="text-xs leading-relaxed">
          {quote?.status === "Converted" && quote.projectId
            ? `This quote has been converted to Project ${quote.projectId}. Contact a Project Manager for changes.`
            : (state.message ?? "Edits are disabled for the current role.")}
        </p>
      </div>
    </div>
  );
}
