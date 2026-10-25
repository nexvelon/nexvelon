// REP-5 — the pure rules: relative ranges resolve at RUN time (2b); a month-end
// schedule reports the closed month (2c); catch-up (2c); the permission model (2e).

import { describe, it, expect } from "vitest";
import { resolveRange, resolveYear, validateRangeSpec } from "@/lib/reports/date-ranges";
import { normalizeParams, resolveParams, validateParams } from "@/lib/reports/saved-params";
import { occurrences, planDueRuns, validateSchedule, nextOccurrence } from "@/lib/reports/schedule";
import {
  canRunReport,
  fieldGatesFor,
  planDelivery,
  intersectGates,
  type Principal,
} from "@/lib/reports/access";
import { buildGrantedMatrix } from "@/lib/permissions/seed-matrix";
import type { Role } from "@/lib/types";

describe("relative ranges resolve at run time, not save time", () => {
  const LAST_MONTH = { kind: "relative" as const, preset: "last_month" as const };

  it("the same saved spec gives different dates on different run dates", () => {
    // Saved in March; nothing about March is stored.
    expect(resolveRange(LAST_MONTH, "2026-03-15")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(resolveRange(LAST_MONTH, "2026-11-01")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(resolveRange(LAST_MONTH, "2026-01-01")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });

  it("resolves every preset against the run date", () => {
    const run = "2026-11-01";
    const r = (preset: Parameters<typeof resolveRange>[0]) => resolveRange(preset, run);
    expect(r({ kind: "relative", preset: "yesterday" })).toEqual({ from: "2026-10-31", to: "2026-10-31" });
    expect(r({ kind: "relative", preset: "today" })).toEqual({ from: "2026-11-01", to: "2026-11-01" });
    expect(r({ kind: "relative", preset: "last_7_days" })).toEqual({ from: "2026-10-25", to: "2026-10-31" });
    expect(r({ kind: "relative", preset: "last_30_days" })).toEqual({ from: "2026-10-02", to: "2026-10-31" });
    expect(r({ kind: "relative", preset: "this_month" })).toEqual({ from: "2026-11-01", to: "2026-11-01" });
    expect(r({ kind: "relative", preset: "last_quarter" })).toEqual({ from: "2026-07-01", to: "2026-09-30" });
    expect(r({ kind: "relative", preset: "this_quarter" })).toEqual({ from: "2026-10-01", to: "2026-11-01" });
    expect(r({ kind: "relative", preset: "last_year" })).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(resolveRange({ kind: "relative", preset: "last_quarter" }, "2026-02-10")).toEqual({
      from: "2025-10-01",
      to: "2025-12-31",
    });
  });

  it("fixed dates stay fixed and 'none' defers to the report", () => {
    expect(resolveRange({ kind: "fixed", from: "2026-01-01", to: "2026-03-31" }, "2026-11-01")).toEqual({
      from: "2026-01-01",
      to: "2026-03-31",
    });
    expect(resolveRange({ kind: "none" }, "2026-11-01")).toBeNull();
    expect(validateRangeSpec({ kind: "fixed", from: "2026-04-01", to: "2026-03-01" })).toMatch(/after/);
  });

  it("years resolve at run time too", () => {
    expect(resolveYear({ kind: "relative", preset: "last_year" }, "2027-01-05")).toBe(2026);
    expect(resolveYear({ kind: "fixed", year: 2024 }, "2027-01-05")).toBe(2024);
  });

  it("saved params keep only what the report accepts and resolve per run", () => {
    const p = normalizeParams("hst", { range: LAST_MONTH, year: { kind: "fixed", year: 1999 }, opco: "guardian", limit: 5 });
    expect(p).toEqual({ range: LAST_MONTH, opco: "guardian" }); // year + limit dropped
    expect(resolveParams("hst", p, "2026-11-01")).toEqual({ from: "2026-10-01", to: "2026-10-31", opco: "guardian" });
    expect(normalizeParams("ar-aging", { opco: "guardian", range: LAST_MONTH })).toEqual({}); // not opco-scoped
    expect(validateParams("vendor-spend", { range: { kind: "none" }, limit: 0 })).toMatch(/limit/);
    expect(validateParams("opco-pnl", { opco: "elsewhere" })).toMatch(/operating company/);
  });
});

describe("a month-end schedule reports the month that closed", () => {
  const monthly = { cadence: "monthly" as const, dayOfMonth: 1, startDate: "2026-01-01" };

  it("runs on the 1st and its 'last month' is the month just ended", () => {
    const plan = planDueRuns(monthly, "2026-11-01", new Set(occurrences(monthly, "2026-10-31")), { pointInTime: false });
    expect(plan.deliver).toEqual(["2026-11-01"]);
    expect(resolveParams("pipeline", { range: { kind: "relative", preset: "last_month" } }, plan.deliver[0])).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
  });

  it("a late catch-up still reports the closed month, not the current one", () => {
    // The Nov 1 run was missed; the cron catches up on Nov 3.
    const recorded = new Set(occurrences(monthly, "2026-10-31"));
    const plan = planDueRuns(monthly, "2026-11-03", recorded, { pointInTime: false });
    expect(plan.deliver).toEqual(["2026-11-01"]);
    expect(resolveRange({ kind: "relative", preset: "last_month" }, plan.deliver[0])).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
  });
});

describe("schedules — occurrences and catch-up", () => {
  it("enumerates each cadence from its anchor", () => {
    expect(occurrences({ cadence: "weekly", dayOfWeek: 1, startDate: "2026-10-01" }, "2026-10-20")).toEqual([
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
    ]);
    expect(occurrences({ cadence: "quarterly", dayOfMonth: 5, startDate: "2026-02-10" }, "2027-01-31")).toEqual([
      "2026-04-05",
      "2026-07-05",
      "2026-10-05",
      "2027-01-05",
    ]);
    expect(occurrences({ cadence: "monthly", dayOfMonth: 15, startDate: "2026-10-20" }, "2026-12-31")).toEqual([
      "2026-11-15",
      "2026-12-15",
    ]);
    expect(nextOccurrence({ cadence: "monthly", dayOfMonth: 1, startDate: "2026-01-01" }, "2026-11-01")).toBe("2026-12-01");
  });

  it("a missed run catches up, and a recorded run is never repeated", () => {
    const weekly = { cadence: "weekly" as const, dayOfWeek: 1, startDate: "2026-10-01" };
    const plan = planDueRuns(weekly, "2026-10-20", new Set(["2026-10-05"]), { pointInTime: false });
    expect(plan.deliver).toEqual(["2026-10-12", "2026-10-19"]);
    expect(plan.skip).toEqual([]);
    const again = planDueRuns(weekly, "2026-10-20", new Set(["2026-10-05", "2026-10-12", "2026-10-19"]), {
      pointInTime: false,
    });
    expect(again.deliver).toEqual([]);
  });

  it("a long outage catches up the newest runs and records the rest as skipped", () => {
    const daily = { cadence: "daily" as const, startDate: "2026-10-01" };
    const plan = planDueRuns(daily, "2026-10-10", new Set(), { pointInTime: false, maxCatchUp: 3 });
    expect(plan.deliver).toEqual(["2026-10-08", "2026-10-09", "2026-10-10"]);
    expect(plan.skip.map((s) => s.runDate)).toHaveLength(7);
    expect(plan.skip[0].reason).toMatch(/not caught up/);
  });

  it("point-in-time reports deliver only the latest missed run (balances can't be back-dated)", () => {
    const daily = { cadence: "daily" as const, startDate: "2026-10-01" };
    const plan = planDueRuns(daily, "2026-10-04", new Set(["2026-10-01"]), { pointInTime: true });
    expect(plan.deliver).toEqual(["2026-10-04"]);
    expect(plan.skip.map((s) => s.runDate)).toEqual(["2026-10-02", "2026-10-03"]);
    expect(plan.skip[0].reason).toMatch(/Superseded/);
  });

  it("validates the day fields", () => {
    expect(validateSchedule({ cadence: "monthly", dayOfMonth: 31, startDate: "2026-10-01" })).toMatch(/1 to 28/);
    expect(validateSchedule({ cadence: "weekly", dayOfWeek: 9, startDate: "2026-10-01" })).toMatch(/day of the week/);
    expect(validateSchedule({ cadence: "daily", startDate: "2026-10-01" })).toBeNull();
  });
});

// ─── 2e — the permission model ────────────────────────────────────────────────

const MATRIX = buildGrantedMatrix();
function person(role: Role, over: Partial<Principal> = {}, overrides: { grant?: string[]; deny?: string[] } = {}): Principal {
  const eff = new Set(MATRIX.get(role) ?? []);
  for (const g of overrides.grant ?? []) eff.add(g);
  for (const d of overrides.deny ?? []) eff.delete(d);
  return { id: `${role}-1`, name: role, email: `${role.toLowerCase()}@nexvelon.test`, status: "Active", role, effective: eff, ...over };
}

describe("2e — who may receive what", () => {
  const admin = person("Admin");

  it("an Admin's WIP report is not sent to someone who couldn't run it", () => {
    const rep = person("SalesRep"); // no financials at all
    const acct = person("Accountant"); // financials:edit
    const plan = planDelivery({ owner: admin, recipients: [rep, acct], reportKey: "wip" });
    expect(plan.ownerOk).toBe(true);
    expect(plan.recipients.map((r) => [r.principal.role, r.allowed, r.reason])).toEqual([
      ["SalesRep", false, "no_permission"],
      ["Accountant", true, undefined],
    ]);
  });

  it("a deny override removes access even though the role would allow it", () => {
    const acct = person("Accountant", {}, { deny: ["financials:edit"] });
    expect(canRunReport(acct, "wip")).toBe(false);
  });

  it("a grant override can't exceed the role matrix (both must agree)", () => {
    const rep = person("SalesRep", {}, { grant: ["financials:edit", "financials:view"] });
    expect(canRunReport(rep, "wip")).toBe(false);
  });

  it("deactivated owner → the run is not generated at all", () => {
    const plan = planDelivery({ owner: person("Admin", { status: "Suspended" }), recipients: [admin], reportKey: "wip" });
    expect(plan.ownerOk).toBe(false);
    expect(plan.ownerReason).toMatch(/isn't active/);
    expect(plan.recipients).toEqual([]);
  });

  it("owner whose permission was reduced → paused, nothing generated", () => {
    const pm = person("ProjectManager", {}, { deny: ["financials:view"] });
    const plan = planDelivery({ owner: pm, recipients: [pm], reportKey: "ar-aging" });
    expect(plan.ownerOk).toBe(false);
    expect(plan.ownerReason).toMatch(/no longer has permission/);
  });

  it("only owners with reports:create may send to other people; anyone may send to themselves", () => {
    const acct = person("Accountant");
    const other = person("Accountant", { id: "acct-2", name: "Other" });
    const plan = planDelivery({ owner: acct, recipients: [acct, other], reportKey: "ar-aging" });
    expect(plan.recipients.map((r) => [r.principal.id, r.allowed, r.reason])).toEqual([
      ["Accountant-1", true, undefined],
      ["acct-2", false, "owner_cannot_distribute"],
    ]);
  });

  it("inactive recipients and recipients with no email are skipped, others still receive", () => {
    const plan = planDelivery({
      owner: admin,
      recipients: [person("Accountant", { status: "Terminated" }), person("Accountant", { id: "a2", email: null }), person("Accountant", { id: "a3" })],
      reportKey: "ar-aging",
    });
    expect(plan.recipients.map((r) => r.reason ?? "ok")).toEqual(["inactive", "no_email", "ok"]);
  });

  it("field gates are the intersection of owner and recipient (SEC-1)", () => {
    const viewOnly = person("ViewOnly"); // inventory:view, no viewCost
    const plan = planDelivery({ owner: admin, recipients: [viewOnly], reportKey: "inventory-valuation" });
    expect(plan.recipients[0].allowed).toBe(true);
    expect(plan.recipients[0].gates.inventoryCost).toBe(false);
    // …and an owner can't broadcast a field they can't see themselves.
    expect(intersectGates(fieldGatesFor(viewOnly), fieldGatesFor(admin)).inventoryCost).toBe(false);
  });
});
