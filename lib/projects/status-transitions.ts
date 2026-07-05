// PROJ2-1 — single source of truth for the project status state machine.
// Same rules for every projects:edit holder — no admin bypass. Both the server
// action (updateProjectStatusAction) and the UI (ProjectStatusControl) read
// from here so they never diverge.

import type { ProjectStatus } from "@/lib/types/database";

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  on_hold: "On Hold",
  substantially_complete: "Substantially Complete",
  closed: "Closed",
  cancelled: "Cancelled",
};

export type ProjectStatusTone =
  | "success"
  | "warning"
  | "info"
  | "neutral"
  | "danger";

export const PROJECT_STATUS_TONE: Record<ProjectStatus, ProjectStatusTone> = {
  active: "success",
  on_hold: "warning",
  substantially_complete: "info",
  closed: "neutral",
  cancelled: "danger",
};

// Allowed forward/back transitions. A status is never terminal — everything can
// return to 'active' so a mistaken close/cancel is recoverable.
export const ALLOWED_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  active: ["on_hold", "substantially_complete", "cancelled"],
  on_hold: ["active", "cancelled"],
  substantially_complete: ["closed", "active"],
  closed: ["active"],
  cancelled: ["active"],
};

export function canTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function listAllowedNextStatuses(from: ProjectStatus): ProjectStatus[] {
  return ALLOWED_TRANSITIONS[from] ?? [];
}
