// PERM-4 — pure client-safe logic for the per-user override editor. The
// tri-state (Default / Granted / Denied) → server-action mapping and the
// override-keying, extracted so they're unit-testable without rendering.
//
// The EFFECTIVE permission set is NOT computed here — it comes from the server
// (getUserEffectivePermissionsAction → resolveEffectiveForUser), so the UI can
// never diverge from what the server enforces.

import type { Action, Resource } from "@/lib/permissions";

export type CellState = "default" | "granted" | "denied";

export const permKey = (resource: string, action: string) => `${resource}:${action}`;

export interface ActiveOverride {
  resource: string;
  action: string;
  state: "granted" | "denied";
}

/** Index active overrides by "resource:action" → state. */
export function overrideMap(overrides: ActiveOverride[]): Map<string, "granted" | "denied"> {
  const m = new Map<string, "granted" | "denied">();
  for (const o of overrides) m.set(permKey(o.resource, o.action), o.state);
  return m;
}

/** The tri-state of one cell: an active override wins, else 'default' (role baseline). */
export function cellStateFor(
  resource: Resource,
  action: Action,
  overrides: Map<string, "granted" | "denied">
): CellState {
  return overrides.get(permKey(resource, action)) ?? "default";
}

export type CellChange =
  | { kind: "revoke" }
  | { kind: "set"; state: "granted" | "denied" };

/**
 * Map a target tri-state to the server action to run:
 *   Default  → revoke the override (back to role baseline)
 *   Granted  → setOverride(state: 'granted')  [reason required]
 *   Denied   → setOverride(state: 'denied')   [reason required]
 */
export function cellChangeFor(target: CellState): CellChange {
  return target === "default" ? { kind: "revoke" } : { kind: "set", state: target };
}

/** Grant/deny require a reason (the audit needs it); revoke does not. */
export function reasonRequired(target: CellState): boolean {
  return target === "granted" || target === "denied";
}
