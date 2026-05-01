import { cn } from "@/lib/utils";
import type { ProjectStatus } from "@/lib/types";

const STYLES: Record<ProjectStatus, string> = {
  Planning: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  Scheduled: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  "In Progress": "bg-brand-navy/10 text-brand-navy ring-1 ring-brand-navy/15",
  "On Hold": "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  "At Risk": "bg-red-50 text-red-700 ring-1 ring-red-200",
  Commissioning: "bg-brand-gold/15 text-amber-800 ring-1 ring-brand-gold/30",
  Completed: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  Closed: "bg-slate-100 text-slate-500 ring-1 ring-slate-200 line-through",
};

export function ProjectStatusBadge({
  status,
  size = "sm",
}: {
  status: ProjectStatus;
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
      {status}
    </span>
  );
}
