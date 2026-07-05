// PROJ2-1 — the project status state machine. Pure functions, no mocks.

import { describe, it, expect } from "vitest";
import {
  ALLOWED_TRANSITIONS,
  canTransition,
  listAllowedNextStatuses,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_TONE,
} from "@/lib/projects/status-transitions";
import type { ProjectStatus } from "@/lib/types/database";

const ALL: ProjectStatus[] = [
  "active",
  "on_hold",
  "substantially_complete",
  "closed",
  "cancelled",
];

describe("project status transitions", () => {
  it("allows exactly the documented transitions", () => {
    // Every listed transition returns true.
    for (const from of ALL) {
      for (const to of ALLOWED_TRANSITIONS[from]) {
        expect(canTransition(from, to)).toBe(true);
      }
    }
  });

  it("rejects every non-listed transition (incl. self)", () => {
    for (const from of ALL) {
      for (const to of ALL) {
        const allowed = ALLOWED_TRANSITIONS[from].includes(to);
        if (!allowed) expect(canTransition(from, to)).toBe(false);
      }
    }
    // self-transition is never in the allow-list
    for (const s of ALL) expect(canTransition(s, s)).toBe(false);
  });

  it("listAllowedNextStatuses returns the exact expected set per status", () => {
    expect(listAllowedNextStatuses("active")).toEqual([
      "on_hold",
      "substantially_complete",
      "cancelled",
    ]);
    expect(listAllowedNextStatuses("on_hold")).toEqual(["active", "cancelled"]);
    expect(listAllowedNextStatuses("substantially_complete")).toEqual([
      "closed",
      "active",
    ]);
    expect(listAllowedNextStatuses("closed")).toEqual(["active"]);
    expect(listAllowedNextStatuses("cancelled")).toEqual(["active"]);
  });

  it("has a label + tone for every status", () => {
    for (const s of ALL) {
      expect(PROJECT_STATUS_LABELS[s]).toBeTruthy();
      expect(PROJECT_STATUS_TONE[s]).toBeTruthy();
    }
  });
});
