// PROJ2-16 — the site-log API. The one-log-per-(job,date) rule with log_exists,
// submit stamping, the edited-after-submission trail, the crew party rules, the
// recent-days window, and — THE CRITICAL GUARD — that recording crew hours never
// writes to labour_entries or any cost table (§2d no-double-count).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  logs: [] as Record<string, unknown>[],
  crew: [] as Record<string, unknown>[],
  attachments: [] as Record<string, unknown>[],
  inserts: [] as { table: string; payload: Record<string, unknown> }[],
  updates: [] as { table: string; id: unknown; payload: Record<string, unknown> }[],
  job: { id: "job1", project_id: "p1" } as Record<string, unknown> | null,
  today: "2026-07-24",
  logActivity: vi.fn(async () => {}),
  touchedTables: new Set<string>(),
}));

function filt(rows: Record<string, unknown>[], filters: ChainCtx["filters"]) {
  let out = rows;
  for (const f of filters) {
    const args = f.args as unknown[];
    const col = args[0] as string;
    if (f.method === "eq") out = out.filter((r) => r[col] === args[1]);
    if (f.method === "in") out = out.filter((r) => (args[1] as unknown[]).includes(r[col]));
    if (f.method === "gte") out = out.filter((r) => String(r[col]) >= String(args[1]));
  }
  return out;
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  h.touchedTables.add(ctx.table);
  const single = ctx.terminal === "single" || ctx.terminal === "maybeSingle";
  const store =
    ctx.table === "site_logs" ? h.logs : ctx.table === "site_log_crew" ? h.crew : ctx.table === "attachments" ? h.attachments : null;
  if (store) {
    if (ctx.op === "insert") {
      const p = ctx.payload as Record<string, unknown>;
      const row = { id: `${ctx.table}-${h.inserts.filter((i) => i.table === ctx.table).length + 1}`, ...p };
      h.inserts.push({ table: ctx.table, payload: p });
      if (ctx.table === "site_logs") h.logs = [...h.logs, row];
      if (ctx.table === "site_log_crew") h.crew = [...h.crew, row];
      return { data: row, error: null };
    }
    if (ctx.op === "update") {
      const id = ctx.filters.find((f) => f.method === "eq")?.args[1];
      h.updates.push({ table: ctx.table, id, payload: ctx.payload as Record<string, unknown> });
      if (ctx.table === "site_logs") h.logs = h.logs.map((r) => (r.id === id ? { ...r, ...(ctx.payload as object) } : r));
      const merged = (ctx.table === "site_logs" ? h.logs : h.crew).find((r) => r.id === id);
      return { data: merged ?? null, error: null };
    }
    if (ctx.op === "delete") {
      const id = ctx.filters.find((f) => f.method === "eq")?.args[1];
      const existed = store.some((r) => r.id === id);
      if (ctx.table === "site_logs") h.logs = h.logs.filter((r) => r.id !== id);
      return { data: existed ? [{ id }] : [], error: null };
    }
    const rows = filt(store, ctx.filters);
    return { data: single ? (rows[0] ?? null) : rows, error: null };
  }
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeSupabaseMock(resolve) }));
vi.mock("@/lib/format", async (orig) => ({
  ...(await orig<typeof import("@/lib/format")>()),
  businessDateISO: () => h.today,
}));
vi.mock("@/lib/api/projects", () => ({ getJobById: async () => h.job }));
vi.mock("@/lib/api/sub-agreements", () => ({ jobLabel: () => "Main Job" }));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: h.logActivity }));

import {
  createLog,
  submitLog,
  updateLog,
  addCrew,
  getRecentLogsForProject,
  SiteLogError,
} from "@/lib/api/site-logs";

beforeEach(() => {
  h.logs = [];
  h.crew = [];
  h.attachments = [];
  h.inserts = [];
  h.updates = [];
  h.job = { id: "job1", project_id: "p1" };
  h.today = "2026-07-24";
  h.touchedTables = new Set();
  h.logActivity.mockClear();
});

describe("createLog — one per (job, date)", () => {
  it("creates a draft resolving project from the job", async () => {
    const row = await createLog({ jobId: "job1", logDate: "2026-07-24" });
    expect(row).toBeTruthy();
    expect(h.inserts[0].payload).toMatchObject({ project_id: "p1", job_id: "job1", status: "draft" });
  });

  it("a duplicate (job, date) throws log_exists with the existing id", async () => {
    h.logs = [{ id: "log-existing", job_id: "job1", log_date: "2026-07-24" }];
    await expect(createLog({ jobId: "job1", logDate: "2026-07-24" })).rejects.toMatchObject({
      code: "log_exists",
      existingId: "log-existing",
    });
    expect(h.inserts).toHaveLength(0);
  });
});

describe("submitLog", () => {
  it("stamps submitted_at/by and flips status", async () => {
    h.logs = [{ id: "log1", status: "draft" }];
    await submitLog("log1", "u9");
    expect(h.updates.at(-1)!.payload).toMatchObject({ status: "submitted", submitted_by: "u9" });
    expect(h.updates.at(-1)!.payload.submitted_at).toBeTruthy();
  });
});

describe("updateLog — edited-after-submission trail", () => {
  it("records an activity entry when editing a SUBMITTED log", async () => {
    h.logs = [{ id: "log1", project_id: "p1", status: "submitted", log_date: "2026-07-20" }];
    await updateLog("log1", { workPerformed: "corrected" }, "u1");
    expect(h.logActivity).toHaveBeenCalledTimes(1);
    expect((h.logActivity.mock.calls[0] as unknown[])[3]).toMatchObject({
      site_log_edited_after_submit: { from: null, to: "2026-07-20" },
    });
  });

  it("does NOT record the trail for a draft edit", async () => {
    h.logs = [{ id: "log1", project_id: "p1", status: "draft", log_date: "2026-07-24" }];
    await updateLog("log1", { workPerformed: "wip" }, "u1");
    expect(h.logActivity).not.toHaveBeenCalled();
  });
});

describe("addCrew — party rules", () => {
  it("rejects neither FK nor name", async () => {
    await expect(addCrew({ siteLogId: "log1", hours: 8 })).rejects.toMatchObject({ code: "invalid_crew" });
  });
  it("rejects both FKs", async () => {
    await expect(
      addCrew({ siteLogId: "log1", techId: "t1", subcontractorId: "s1" })
    ).rejects.toBeInstanceOf(SiteLogError);
  });
  it("accepts a tech-only line (name dropped)", async () => {
    await addCrew({ siteLogId: "log1", techId: "t1", hours: 8 });
    expect(h.inserts.at(-1)!.payload).toMatchObject({ tech_id: "t1", subcontractor_id: null, person_name: null });
  });
  it("accepts a name-only line", async () => {
    await addCrew({ siteLogId: "log1", personName: "City Inspector", hours: 1 });
    expect(h.inserts.at(-1)!.payload).toMatchObject({ tech_id: null, subcontractor_id: null, person_name: "City Inspector" });
  });
});

describe("getRecentLogsForProject — day window", () => {
  it("filters logs to the last N days", async () => {
    h.logs = [
      { id: "l1", project_id: "p1", job_id: "job1", log_date: "2026-07-23" }, // within 7d
      { id: "l2", project_id: "p1", job_id: "job1", log_date: "2026-07-01" }, // older than 7d
    ];
    const recent = await getRecentLogsForProject("p1", 7);
    expect(recent.map((r) => r.id)).toEqual(["l1"]);
  });
});

describe("§2d — hours are a field record, NOT a cost input", () => {
  it("recording crew hours NEVER writes to labour_entries or any cost table", async () => {
    const log = await createLog({ jobId: "job1", logDate: "2026-07-24" });
    await addCrew({ siteLogId: log.id, techId: "t1", hours: 9.5 });
    await addCrew({ siteLogId: log.id, personName: "Day labourer", hours: 8 });
    // The ONLY tables the site log touched are its own + the job lookup (mocked).
    expect(h.touchedTables.has("labour_entries")).toBe(false);
    expect(h.touchedTables.has("project_cost_centers")).toBe(false);
    // and hours live only in site_log_crew inserts
    expect(h.inserts.filter((i) => i.table === "site_log_crew")).toHaveLength(2);
  });
});
