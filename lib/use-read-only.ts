"use client";

import type { QuoteStatus } from "./types";
import { useRole } from "./role-context";
import { hasPermission } from "./permissions";

export interface ReadOnlyState {
  readOnly: boolean;
  reason: "role" | "status" | null;
  message?: string;
}

export function useReadOnly(status: QuoteStatus): ReadOnlyState {
  const { role } = useRole();

  // Roles with no edit permission on quotes are always read-only.
  if (!hasPermission(role, "quotes", "edit")) {
    return {
      readOnly: true,
      reason: "role",
      message:
        role === "Accountant"
          ? "Read-only — Accountants can review every quote but edits go through Sales or PM."
          : "Read-only — your role does not allow quote edits.",
    };
  }

  // Once converted to a project, the quote is locked for everyone.
  if (status === "Converted") {
    return {
      readOnly: true,
      reason: "status",
      message:
        "This quote has been converted to a project. Contact a Project Manager to amend the linked work order.",
    };
  }

  // Approved quotes are locked to everyone except an Admin. An Admin can edit
  // directly or reopen the quote to Draft (in the builder) for broader edits.
  if (status === "Approved" && role !== "Admin") {
    return {
      readOnly: true,
      reason: "status",
      message:
        "Approved quotes can only be edited by an Admin. Ask an Admin to reopen it for changes.",
    };
  }

  return { readOnly: false, reason: null };
}
