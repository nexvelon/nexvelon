// Pre-Quotes cleanup (2026-05-11): mock data emptied. The AuditEntry
// type is preserved.
//
// NOTE: this mock audit log is SEPARATE from the real database audit
// trail in public.auth_audit_log (used by the /users → Activity Log
// tab via lib/api/audit.ts). This module is consumed by older mock-
// data-driven settings panes that show a per-module audit feed. As
// each module wires to its real DB write-trail, the consumer will
// migrate to a real query and stop reading this empty array.

export interface AuditEntry {
  id: string;
  timestamp: string; // ISO
  userId: string;
  action: string;
  module:
    | "Quotes"
    | "Projects"
    | "Inventory"
    | "Scheduling"
    | "Financials"
    | "Users"
    | "Settings"
    | "Auth";
  target: string;
  ipAddress: string;
  result: "Success" | "Denied" | "Error";
}

export const auditLog: AuditEntry[] = [];
