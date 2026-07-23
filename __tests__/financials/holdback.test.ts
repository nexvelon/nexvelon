// FIN-9 — Ontario holdback release. The claims that matter: the 60-day clock
// (eligible = SC + 60), the create-guards, the server-side eligibility re-check
// on release, and the release invoice being generated for the exact held sum.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const s = vi.hoisted(() => ({
  today: "2026-07-20",
  project: { id: "p1", status: "substantially_complete", actual_completion: "2026-05-01" } as Record<string, unknown> | null,
  invoices: [] as Record<string, unknown>[],
  releases: [] as Record<string, unknown>[],
  invoicePayments: [] as Record<string, unknown>[],
  insertedReleases: [] as Record<string, unknown>[],
  releaseUpdates: [] as Record<string, unknown>[],
  seq: 0,
  // captured invoice-machinery calls
  createdInvoiceFor: [] as string[],
  addedLines: [] as Record<string, unknown>[],
  taxExemptSet: [] as boolean[],
  issued: false,
}));

// Deterministic "today" for the eligibility math.
vi.mock("@/lib/format", async (orig) => {
  const actual = await orig<typeof import("@/lib/format")>();
  return {
    ...actual,
    businessDateISO: () => s.today,
    businessDatePlusDaysISO: (n: number) => `plus-${n}`,
  };
});
vi.mock("@/lib/api/activity-log", () => ({ logActivity: vi.fn(async () => {}) }));
// The invoice machinery is exercised in its own suites — here we just capture.
vi.mock("@/lib/api/invoices", () => ({
  createInvoiceForProject: vi.fn(async (projectId: string) => {
    s.createdInvoiceFor.push(projectId);
    return { id: "rel-inv-1", project_id: projectId };
  }),
  addManualLine: vi.fn(async (invoiceId: string, input: Record<string, unknown>) => {
    s.addedLines.push({ invoiceId, ...input });
    return { invoice: {}, lines: [] };
  }),
  setTaxExempt: vi.fn(async (_id: string, v: boolean) => {
    s.taxExemptSet.push(v);
    return { invoice: {}, lines: [] };
  }),
  setDueDate: vi.fn(async () => ({ invoice: {}, lines: [] })),
  issueInvoice: vi.fn(async () => {
    s.issued = true;
    return { id: "rel-inv-1", invoice_number: "GIN-9" };
  }),
}));

function filt(rows: Record<string, unknown>[], filters: ChainCtx["filters"]) {
  let out = rows;
  for (const f of filters) {
    const [col, val] = f.args as [string, unknown];
    if (f.method === "eq") out = out.filter((r) => r[col] === val);
    if (f.method === "in") out = out.filter((r) => (val as unknown[]).includes(r[col]));
    if (f.method === "neq") out = out.filter((r) => r[col] !== val);
  }
  return out;
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  const single = ctx.terminal === "single" || ctx.terminal === "maybeSingle";
  switch (ctx.table) {
    case "projects":
      return { data: s.project, error: null };
    case "invoices":
      return { data: filt(s.invoices, ctx.filters), error: null };
    case "invoice_payments":
      return { data: filt(s.invoicePayments, ctx.filters), error: null };
    case "holdback_releases": {
      if (ctx.op === "insert") {
        const p = ctx.payload as Record<string, unknown>;
        const row = { id: `rel-${++s.seq}`, released_at: null, release_invoice_id: null, ...p };
        s.releases = [...s.releases, row];
        s.insertedReleases.push(p);
        return { data: row, error: null };
      }
      if (ctx.op === "update") {
        const p = ctx.payload as Record<string, unknown>;
        s.releaseUpdates.push(p);
        const id = ctx.filters.find((f) => f.method === "eq")?.args[1];
        s.releases = s.releases.map((r) => (r.id === id ? { ...r, ...p } : r));
        return { data: s.releases.find((r) => r.id === id) ?? null, error: null };
      }
      const rows = filt(s.releases, ctx.filters);
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }
    default:
      return { data: null, error: null };
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));

import {
  getProjectHoldbackStatus,
  createHoldbackRelease,
  releaseHoldback,
  voidHoldbackRelease,
  HoldbackError,
} from "@/lib/api/holdback";

beforeEach(() => {
  s.today = "2026-07-20";
  s.project = { id: "p1", status: "substantially_complete", actual_completion: "2026-05-01" };
  // two issued invoices retaining 100 + 50 = 150 holdback
  s.invoices = [
    { project_id: "p1", holdback_amount: 100, is_holdback_release: false, status: "sent" },
    { project_id: "p1", holdback_amount: 50, is_holdback_release: false, status: "paid" },
  ];
  s.releases = [];
  s.invoicePayments = [];
  s.insertedReleases = [];
  s.releaseUpdates = [];
  s.seq = 0;
  s.createdInvoiceFor = [];
  s.addedLines = [];
  s.taxExemptSet = [];
  s.issued = false;
});

describe("getProjectHoldbackStatus", () => {
  it("eligible date = substantial completion + 60 days", async () => {
    const st = await getProjectHoldbackStatus("p1");
    expect(st.retained).toBe(150);
    expect(st.substantial_completion_date).toBe("2026-05-01");
    expect(st.eligible_release_date).toBe("2026-06-30"); // May 1 + 60
  });

  it("is eligible on and after the 60th day, not before", async () => {
    s.project = { id: "p1", status: "substantially_complete", actual_completion: "2026-05-01" };

    s.today = "2026-06-29"; // day 59
    expect((await getProjectHoldbackStatus("p1")).is_eligible).toBe(false);

    s.today = "2026-06-30"; // day 60 — eligible
    const at60 = await getProjectHoldbackStatus("p1");
    expect(at60.is_eligible).toBe(true);
    expect(at60.days_until_eligible).toBe(0);

    s.today = "2026-07-01"; // day 61
    const at61 = await getProjectHoldbackStatus("p1");
    expect(at61.is_eligible).toBe(true);
    expect(at61.days_until_eligible).toBe(-1);
  });

  it("excludes holdback-release invoices from the retained total", async () => {
    s.invoices.push({ project_id: "p1", holdback_amount: 0, is_holdback_release: true, status: "sent" });
    expect((await getProjectHoldbackStatus("p1")).retained).toBe(150);
  });
});

describe("createHoldbackRelease — guards", () => {
  it("rejects a project that isn't substantially complete", async () => {
    s.project = { id: "p1", status: "active", actual_completion: "2026-05-01" };
    await expect(createHoldbackRelease({ projectId: "p1" })).rejects.toMatchObject({
      code: "not_substantially_complete",
    });
  });

  it("rejects when there's no completion date", async () => {
    s.project = { id: "p1", status: "substantially_complete", actual_completion: null };
    await expect(createHoldbackRelease({ projectId: "p1" })).rejects.toMatchObject({
      code: "no_completion_date",
    });
  });

  it("rejects when no holdback has been retained", async () => {
    s.invoices = [];
    await expect(createHoldbackRelease({ projectId: "p1" })).rejects.toMatchObject({
      code: "no_holdback_retained",
    });
  });

  it("rejects a second live release", async () => {
    s.releases = [{ id: "rel-x", project_id: "p1", status: "pending" }];
    await expect(createHoldbackRelease({ projectId: "p1" })).rejects.toMatchObject({
      code: "release_exists",
    });
  });

  it("status is 'eligible' when past the clock, 'pending' when not", async () => {
    s.today = "2026-07-01"; // past June 30
    const rel = await createHoldbackRelease({ projectId: "p1" });
    expect(rel.amount).toBe(150);
    expect(rel.eligible_release_date).toBe("2026-06-30");
    expect(rel.status).toBe("eligible");

    s.releases = [];
    s.today = "2026-05-15"; // before the clock
    const pending = await createHoldbackRelease({ projectId: "p1" });
    expect(pending.status).toBe("pending");
  });
});

describe("releaseHoldback", () => {
  it("rejects when today is before the eligible date (server re-check)", async () => {
    s.releases = [{ id: "rel-1", project_id: "p1", amount: 150, status: "eligible", eligible_release_date: "2026-06-30", released_at: null, release_invoice_id: null }];
    s.today = "2026-06-29"; // stale 'eligible' but not actually there yet
    await expect(releaseHoldback({ releaseId: "rel-1" })).rejects.toMatchObject({
      code: "not_yet_eligible",
    });
    expect(s.issued).toBe(false);
  });

  it("generates a tax-exempt release invoice for the exact held amount and links it", async () => {
    s.releases = [{ id: "rel-1", project_id: "p1", amount: 150, status: "eligible", eligible_release_date: "2026-06-30", released_at: null, release_invoice_id: null }];
    s.today = "2026-07-01";
    const res = await releaseHoldback({ releaseId: "rel-1" });

    expect(s.createdInvoiceFor).toEqual(["p1"]);
    expect(s.taxExemptSet).toContain(true); // no double HST
    expect(s.addedLines[0]).toMatchObject({ quantity: 1, unit_price: 150 });
    expect(s.issued).toBe(true);
    expect(res.invoice_id).toBe("rel-inv-1");
    // release marked released + linked
    expect(s.releaseUpdates[0]).toMatchObject({
      status: "released",
      released_at: "2026-07-01",
      release_invoice_id: "rel-inv-1",
    });
  });

  it("rejects an already-released record", async () => {
    s.releases = [{ id: "rel-1", project_id: "p1", amount: 150, status: "released", eligible_release_date: "2026-06-30", released_at: "2026-07-01", release_invoice_id: "x" }];
    await expect(releaseHoldback({ releaseId: "rel-1" })).rejects.toBeInstanceOf(HoldbackError);
  });
});

describe("voidHoldbackRelease", () => {
  it("is blocked when the release invoice has payments", async () => {
    s.releases = [{ id: "rel-1", project_id: "p1", amount: 150, status: "released", eligible_release_date: "2026-06-30", released_at: "2026-07-01", release_invoice_id: "rel-inv-1" }];
    s.invoicePayments = [{ id: "pay1", invoice_id: "rel-inv-1", amount: 150 }];
    await expect(voidHoldbackRelease({ releaseId: "rel-1" })).rejects.toMatchObject({
      code: "has_payments",
    });
  });

  it("voids the record (and its unpaid invoice)", async () => {
    s.releases = [{ id: "rel-1", project_id: "p1", amount: 150, status: "eligible", eligible_release_date: "2026-06-30", released_at: null, release_invoice_id: "rel-inv-1" }];
    const res = await voidHoldbackRelease({ releaseId: "rel-1" });
    expect(res.status).toBe("void");
  });
});
