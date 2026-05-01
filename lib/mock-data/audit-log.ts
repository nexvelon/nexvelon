import { addMinutes, subDays, subMinutes } from "date-fns";
import { TODAY } from "../dashboard-data";
import { users } from "./users";

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

const TEMPLATES: Array<Omit<AuditEntry, "id" | "timestamp" | "userId" | "ipAddress">> = [
  { action: "Login", module: "Auth", target: "—", result: "Success" },
  { action: "Quote · Update", module: "Quotes", target: "Q-2026-0118", result: "Success" },
  { action: "Quote · Convert to Project", module: "Quotes", target: "Q-2026-0118 → pr-001", result: "Success" },
  { action: "Project · Edit Tasks", module: "Projects", target: "pr-001 — Meridian Tower", result: "Success" },
  { action: "Project · Upload Document", module: "Projects", target: "pr-001 / AsBuilt_Draft_v0.4.pdf", result: "Success" },
  { action: "Inventory · Allocate", module: "Inventory", target: "p-001 KT-400 ×4 → pr-001", result: "Success" },
  { action: "Inventory · Adjust Stock", module: "Inventory", target: "p-014 PG9914 −2 (broken in transit)", result: "Success" },
  { action: "Schedule · Reassign Job", module: "Scheduling", target: "Job-12 → Jin Park", result: "Success" },
  { action: "Schedule · Reassign Job", module: "Scheduling", target: "Job-19 → Elena Vasquez", result: "Denied" },
  { action: "Invoice · Send", module: "Financials", target: "INV-2026-0301 → c-001", result: "Success" },
  { action: "Invoice · Receive Payment", module: "Financials", target: "INV-2026-0312 — $28,815.00", result: "Success" },
  { action: "Bill · Enter", module: "Financials", target: "Anixter — Apr 2026 — $14,820.00", result: "Success" },
  { action: "Tax · Generate HST Return", module: "Financials", target: "Q1 2026", result: "Success" },
  { action: "User · Invite", module: "Users", target: "noah.esterhuyse@nexvelon.com", result: "Success" },
  { action: "User · Permission Override", module: "Users", target: "u-002 — quotes.viewMargin → on", result: "Denied" },
  { action: "User · Suspend", module: "Users", target: "u-017 (Greta Halvorsen)", result: "Success" },
  { action: "Settings · Update Theme", module: "Settings", target: "Brand colours v2", result: "Success" },
  { action: "Auth · Failed login", module: "Auth", target: "—", result: "Denied" },
  { action: "Auth · MFA enrolled", module: "Auth", target: "—", result: "Success" },
];

const IPS = [
  "172.20.10.4",
  "10.0.0.22",
  "192.168.1.45",
  "73.142.211.18",
  "24.226.18.98",
  "76.69.42.110",
];

function seed(s: string): number {
  let h = 7;
  for (const ch of s) h = (h * 33 + ch.charCodeAt(0)) % 100000;
  return h;
}

function buildLog(): AuditEntry[] {
  const out: AuditEntry[] = [];
  const start = subDays(TODAY, 14);
  for (let i = 0; i < 100; i++) {
    const tpl = TEMPLATES[seed(`tpl${i}`) % TEMPLATES.length];
    const u = users[seed(`u${i}`) % users.length];
    const minutesIn = (seed(`m${i}`) % (14 * 24 * 60));
    const ts = addMinutes(start, minutesIn);
    const offset = seed(`o${i}`) % 60;
    const adjusted = i % 7 === 0 ? subMinutes(ts, offset) : ts;
    out.push({
      id: `al-${i.toString().padStart(4, "0")}`,
      timestamp: adjusted.toISOString(),
      userId: u.id,
      ipAddress: IPS[seed(`ip${i}`) % IPS.length],
      ...tpl,
    });
  }
  return out.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export const auditLog: AuditEntry[] = buildLog();
