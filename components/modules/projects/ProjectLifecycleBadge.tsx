// PROJ2-1 — badge for the DB-backed project lifecycle status. Named
// ProjectLifecycleBadge (not ProjectStatusBadge) to avoid colliding with the
// existing legacy ProjectStatusBadge, which the not-yet-wired mock header still
// renders with the old ProjectStatus union ('Planning' / 'In Progress' / …).
// Mirrors the QuoteStatusBadge structure (rounded-full ring pill, sm/md sizes).

import { cn } from "@/lib/utils";
import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_TONE,
  type ProjectStatusTone,
} from "@/lib/projects/status-transitions";
import type { ProjectStatus } from "@/lib/types/database";

const TONE_STYLES: Record<ProjectStatusTone, string> = {
  success: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  info: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  neutral: "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-300",
  danger: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

export function ProjectLifecycleBadge({
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
        TONE_STYLES[PROJECT_STATUS_TONE[status]]
      )}
    >
      {PROJECT_STATUS_LABELS[status]}
    </span>
  );
}
