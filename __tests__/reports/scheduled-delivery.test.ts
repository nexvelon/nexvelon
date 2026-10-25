// REP-5 — the scheduled-delivery engine against a stateful mock database:
// permission enforced AT GENERATION for owner + each recipient (2e); a redacted
// field never reaches an unpermitted recipient's emailed file (SEC-1); a failed
// run is recorded (2f); a missed run catches up and a run is never sent twice
// (2c); relative dates resolve against the run date; a report with no data says
// so (§2.8); the existing report queries run inside the unattended scope.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  schedules: [] as Record<string, unknown>[],
  profiles: [] as Record<string, unknown>[],
  overrides: [] as Record<string, unknown>[],
  overridesError: null as { message: string } | null,
  runs: [] as Record<string, unknown>[],
  deliveries: [] as Record<string, unknown>[],
  scheduleUpdates: [] as Record<string, unknown>[],
  activity: [] as Record<string, unknown>[],
  emails: [] as { to: string; subject: string; text: string; attachment: string }[],
  emailFails: new Set<string>(),
  inventory: null as Record<string, unknown> | null,
  pipelineCalls: [] as { from?: string; to?: string; scoped: boolean }[],
  pipelineThrows: false,
  idc: 0,
}));

vi.mock("@/lib/email/dispatch", () => ({
  dispatchEmail: async (input: { to: string; subject: string; text: string; attachments?: { content: Buffer }[] }) => {
    h.emails.push({
      to: input.to,
      subject: input.subject,
      text: input.text,
      attachment: input.attachments?.[0]?.content.toString("utf8") ?? "",
    });
    return h.emailFails.has(input.to) ? { ok: false, id: null, error: "bounce" } : { ok: true, id: `msg-${h.emails.length}`, error: null };
  },
}));
vi.mock("@/lib/api/products", () => ({ getInventoryReportData: async () => h.inventory }));
vi.mock("@/lib/api/reports/pipeline", async () => {
  const { unattendedClient } = await import("@/lib/supabase/unattended");
  return {
    getSalesPipeline: async (range: { from?: string; to?: string }) => {
      h.pipelineCalls.push({ ...range, scoped: unattendedClient() !== null });
      if (h.pipelineThrows) throw new Error("pipeline query failed");
      return { byStatus: [], totals: { total_count: 0, total_value: 0, conversion_rate: null } };
    },
  };
});

import { runScheduledReports, composeReportEmail } from "@/lib/reports/run-scheduled";
import { buildGrantedMatrix } from "@/lib/permissions/seed-matrix";
import { runUnattended, unattendedClient } from "@/lib/supabase/unattended";

function matrixRows() {
  const out: { role: string; resource: string; action: string }[] = [];
  for (const [role, set] of buildGrantedMatrix()) {
    for (const k of set) {
      const [resource, action] = k.split(":");
      out.push({ role, resource, action });
    }
  }
  return out;
}
const MATRIX = matrixRows();

function eqVal(ctx: ChainCtx, col: string) {
  return ctx.filters.find((f) => f.method === "eq" && f.args[0] === col)?.args[1];
}

function makeClient() {
  const resolve = (ctx: ChainCtx): { data: unknown; error: unknown } => {
    switch (ctx.table) {
      case "report_schedules":
        if (ctx.op === "update") {
          h.scheduleUpdates.push(ctx.payload as Record<string, unknown>);
          return { data: null, error: null };
        }
        return { data: h.schedules, error: null };
      case "profiles":
        return { data: h.profiles, error: null };
      case "role_permission_matrix":
        return { data: MATRIX, error: null };
      case "user_permission_overrides":
        return { data: h.overridesError ? null : h.overrides, error: h.overridesError };
      case "report_runs": {
        if (ctx.op === "insert") {
          const p = ctx.payload as Record<string, unknown>;
          if (p.trigger === "schedule" && h.runs.some((r) => r.schedule_id === p.schedule_id && r.run_date === p.run_date && r.trigger === "schedule")) {
            return { data: null, error: { code: "23505", message: "dup" } };
          }
          const row = { id: `run-${++h.idc}`, ...p };
          h.runs.push(row);
          return { data: { id: row.id }, error: null };
        }
        if (ctx.op === "update") {
          const id = eqVal(ctx, "id");
          const row = h.runs.find((r) => r.id === id);
          if (row) Object.assign(row, ctx.payload);
          return { data: null, error: null };
        }
        const sid = eqVal(ctx, "schedule_id");
        return { data: h.runs.filter((r) => r.schedule_id === sid && r.trigger === "schedule"), error: null };
      }
      case "report_deliveries":
        h.deliveries.push(...(ctx.payload as Record<string, unknown>[]));
        return { data: null, error: null };
      case "activity_log":
        h.activity.push(ctx.payload as Record<string, unknown>);
        return { data: null, error: null };
      default:
        return { data: null, error: null };
    }
  };
  // A minimal chainable client (insert/update/select + any filter).
  return {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from(table: string) {
      const ctx: ChainCtx = { table, op: "select", terminal: "await", filters: [] };
      const proxy: Record<string, unknown> = new Proxy(
        {
          insert: (p: unknown) => ((ctx.op = "insert"), (ctx.payload = p), proxy),
          update: (p: unknown) => ((ctx.op = "update"), (ctx.payload = p), proxy),
          select: () => proxy,
          maybeSingle: async () => resolve(ctx),
          single: async () => resolve(ctx),
          then: (res: (v: unknown) => unknown) => Promise.resolve(resolve(ctx)).then(res),
        } as Record<string, unknown>,
        {
          get(t, prop: string) {
            if (prop in t) return t[prop];
            return (...args: unknown[]) => {
              ctx.filters.push({ method: prop, args });
              return proxy;
            };
          },
        }
      );
      return proxy;
    },
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = () => makeClient() as any;

function profile(id: string, role: string, over: Record<string, unknown> = {}) {
  return { id, email: `${id}@nexvelon.test`, first_name: id, last_name: null, display_name: null, role, status: "Active", ...over };
}

function schedule(over: Record<string, unknown> = {}, report: Record<string, unknown> = {}, recipients = ["admin", "acct"]) {
  return {
    id: "sch-1",
    saved_report_id: "sr-1",
    cadence: "monthly",
    day_of_week: null,
    day_of_month: 1,
    start_date: "2026-10-01",
    active: true,
    saved_report: {
      id: "sr-1",
      name: "Monthly pipeline",
      report_key: "pipeline",
      params: { range: { kind: "relative", preset: "last_month" } },
      format: "csv",
      owner_id: "admin",
      deleted_at: null,
      ...report,
    },
    recipients: recipients.map((user_id) => ({ user_id })),
    ...over,
  };
}

beforeEach(() => {
  h.schedules = [schedule()];
  h.profiles = [profile("admin", "Admin"), profile("acct", "Accountant"), profile("rep", "SalesRep"), profile("viewer", "ViewOnly")];
  h.overrides = [];
  h.overridesError = null;
  h.runs = [];
  h.deliveries = [];
  h.scheduleUpdates = [];
  h.activity = [];
  h.emails = [];
  h.emailFails = new Set();
  h.pipelineCalls = [];
  h.pipelineThrows = false;
  h.inventory = {
    totalValuation: 12345.67,
    valuationByCategory: [{ category: "Cameras", value: 12345.67, units: 40 }],
    aging: [],
    consumption90d: { value: 999, units: 3 },
  };
  h.idc = 0;
});

describe("scheduled delivery — dates and catch-up", () => {
  it("a month-end run on the 1st reports the month that closed, inside the unattended scope", async () => {
    const r = await runScheduledReports(client(), { asOf: "2026-11-01" });
    // Oct 1 (the start date) was also due → caught up; each resolves its OWN run date.
    expect(r.delivered).toBe(2);
    expect(h.pipelineCalls).toEqual([
      { from: "2026-09-01", to: "2026-09-30", scoped: true },
      { from: "2026-10-01", to: "2026-10-31", scoped: true },
    ]);
  });

  it("a missed run catches up, and nothing is ever sent twice", async () => {
    h.runs.push({ id: "old", schedule_id: "sch-1", run_date: "2026-10-01", trigger: "schedule", status: "delivered" });
    await runScheduledReports(client(), { asOf: "2026-11-03" }); // Nov 1 was missed
    expect(h.pipelineCalls.map((c) => c.from)).toEqual(["2026-10-01"]); // still October
    const sentBefore = h.emails.length;
    await runScheduledReports(client(), { asOf: "2026-11-03" }); // re-run (double fire)
    expect(h.emails.length).toBe(sentBefore);
    expect(h.emails[0].subject).toMatch(/delivered late/);
  });
});

describe("scheduled delivery — permissions at generation (2e)", () => {
  it("a recipient who couldn't run the report is skipped, with the reason recorded", async () => {
    h.schedules = [schedule({}, { report_key: "ar-aging", params: {} }, ["admin", "rep"])];
    await runScheduledReports(client(), { asOf: "2026-10-01" });
    expect(h.emails.map((e) => e.to)).toEqual(["admin@nexvelon.test"]);
    expect(h.deliveries.find((d) => d.user_id === "rep")).toMatchObject({
      status: "skipped",
      reason: expect.stringMatching(/permission/),
    });
    expect(h.runs[0].status).toBe("partial");
  });

  it("an owner who lost access → nothing generated, schedule paused, failure recorded", async () => {
    h.schedules = [schedule({}, { owner_id: "acct" }, ["acct"])];
    h.overrides = [{ user_id: "acct", resource: "quotes", action: "view", state: "denied" }];
    const r = await runScheduledReports(client(), { asOf: "2026-10-01" });
    expect(h.pipelineCalls).toEqual([]); // not even generated
    expect(h.emails).toEqual([]);
    expect(r.failed).toBe(1);
    expect(h.runs[0]).toMatchObject({ status: "failed", error: expect.stringMatching(/no longer has permission/) });
    expect(h.scheduleUpdates[0]).toMatchObject({ active: false, paused_reason: expect.stringMatching(/no longer has permission/) });
  });

  it("a deactivated owner pauses the schedule too", async () => {
    h.profiles = h.profiles.map((p) => (p.id === "admin" ? { ...p, status: "Terminated" } : p));
    await runScheduledReports(client(), { asOf: "2026-10-01" });
    expect(h.emails).toEqual([]);
    expect(h.runs[0].error).toMatch(/isn't active/);
  });

  it("fails CLOSED if permission overrides can't be loaded (a deny can't be bypassed)", async () => {
    h.overridesError = { message: "db down" };
    const r = await runScheduledReports(client(), { asOf: "2026-10-01" });
    expect(h.emails).toEqual([]);
    expect(r.failed).toBe(1);
    expect(h.runs[0]).toMatchObject({ status: "failed", error: expect.stringMatching(/overrides/) });
  });

  it("an owner without reports:create can only send to themselves", async () => {
    h.schedules = [schedule({}, { owner_id: "acct", report_key: "ar-aging", params: {} }, ["acct", "admin"])];
    await runScheduledReports(client(), { asOf: "2026-10-01" });
    expect(h.emails.map((e) => e.to)).toEqual(["acct@nexvelon.test"]);
    expect(h.deliveries.find((d) => d.user_id === "admin")?.reason).toMatch(/reports:create/);
  });
});

describe("scheduled delivery — SEC-1 in the emailed file", () => {
  it("an unpermitted recipient's copy has no cost values; a permitted one does", async () => {
    h.schedules = [schedule({}, { report_key: "inventory-valuation", params: {} }, ["admin", "viewer"])];
    await runScheduledReports(client(), { asOf: "2026-10-01" });
    const adminCopy = h.emails.find((e) => e.to === "admin@nexvelon.test")!;
    const viewerCopy = h.emails.find((e) => e.to === "viewer@nexvelon.test")!;
    expect(adminCopy.attachment).toContain("12,345.67");
    expect(viewerCopy.attachment).not.toContain("12,345.67");
    expect(viewerCopy.attachment).not.toContain("12345.67");
    expect(viewerCopy.attachment).toContain("Cameras"); // the row is there; only cost is blank
    expect(viewerCopy.text).toMatch(/cost fields are blank/);
    // one email per person — never a shared recipient list
    expect(h.emails.every((e) => !e.to.includes(","))).toBe(true);
  });

  it("an owner can't broadcast a cost field they can't see themselves", async () => {
    h.profiles.push(profile("wh", "Warehouse"));
    // A ViewOnly owner (no viewCost) sending to themselves + an override granting reports:create.
    h.overrides = [{ user_id: "viewer", resource: "reports", action: "create", state: "granted" }];
    h.schedules = [schedule({}, { owner_id: "viewer", report_key: "inventory-valuation", params: {} }, ["viewer", "wh"])];
    await runScheduledReports(client(), { asOf: "2026-10-01" });
    // reports:create isn't in ViewOnly's role matrix, so the grant alone can't widen
    // distribution — only the owner receives, and without cost.
    expect(h.emails.map((e) => e.to)).toEqual(["viewer@nexvelon.test"]);
    expect(h.emails[0].attachment).not.toContain("12,345.67");
  });
});

describe("scheduled delivery — failure + empty", () => {
  it("a failing report query is recorded as a failed run and returned to the cron", async () => {
    h.pipelineThrows = true;
    const r = await runScheduledReports(client(), { asOf: "2026-10-01" });
    expect(r.failed).toBe(1);
    expect(r.errors[0]).toMatch(/pipeline query failed/);
    expect(h.runs[0]).toMatchObject({ status: "failed", error: "pipeline query failed" });
    expect(h.activity.some((a) => JSON.stringify(a.changes).includes("FAILED"))).toBe(true);
  });

  it("a failed email is recorded per recipient, and an all-failed run is a failure", async () => {
    h.emailFails = new Set(["admin@nexvelon.test", "acct@nexvelon.test"]);
    await runScheduledReports(client(), { asOf: "2026-10-01" });
    expect(h.deliveries.filter((d) => d.status === "failed")).toHaveLength(2);
    expect(h.runs[0]).toMatchObject({ status: "failed", error: "Every email failed to send." });
  });

  it("a report with no data says so — subject, body, and the run record", async () => {
    await runScheduledReports(client(), { asOf: "2026-10-01" });
    expect(h.emails[0].subject).toMatch(/no data/);
    expect(h.emails[0].text).toMatch(/NO DATA.*not the same as a zero/);
    expect(h.runs[0].row_count).toBe(0);
  });

  it("each delivery writes an activity row (§5)", async () => {
    await runScheduledReports(client(), { asOf: "2026-10-01" });
    expect(h.activity).toEqual([
      expect.objectContaining({ entity_type: "saved_report", entity_id: "sr-1", changes: { delivery: expect.anything() } }),
    ]);
  });
});

describe("the unattended scope", () => {
  it("is visible only inside runUnattended", async () => {
    const fake = { tag: "admin" } as never;
    expect(unattendedClient()).toBeNull();
    const inside = await runUnattended(fake, async () => unattendedClient());
    expect(inside).toBe(fake);
    expect(unattendedClient()).toBeNull();
  });

  it("does not leak into a concurrent, unrelated async chain", async () => {
    const fake = { tag: "admin" } as never;
    let seenOutside: unknown = "unset";
    const outside = (async () => {
      await new Promise((r) => setTimeout(r, 5));
      seenOutside = unattendedClient();
    })();
    await runUnattended(fake, async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    await outside;
    expect(seenOutside).toBeNull();
  });
});

describe("email composition", () => {
  it("never uses a relative link", () => {
    const m = composeReportEmail({
      reportName: "X",
      reportTitle: "Y",
      runDate: "2026-11-01",
      late: false,
      filters: "Last month",
      period: "2026-10-01 to 2026-10-31",
      dataset: { title: "t", columns: [], rows: [{ a: 1 }], filename: "f" },
      ownerName: "Ada",
      link: "https://app.nexvelonglobal.com/reports/saved/1",
      redactedFields: false,
    });
    expect(m.html).not.toMatch(/href="\//);
    expect(m.text).toMatch(/1 row/);
  });
});
