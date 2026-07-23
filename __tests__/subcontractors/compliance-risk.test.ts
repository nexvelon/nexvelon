// SUB-3 — the compliance at-risk worklist. Counts + ordering + the crucial
// expired-vs-missing distinction (a lapsed required doc is EXPIRED, not
// missing; an absent one is MISSING). Every state decision comes from the SUB-2
// pure module, so these tests also guard that reuse stays honest.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const TODAY = "2026-07-22";
const PAST_10 = "2026-07-12"; // expired 10 days ago
const SOON_9 = "2026-07-31"; // expires in 9 days
const FAR = "2027-06-01"; // valid, well beyond 30 days

const s = vi.hoisted(() => ({
  subs: [] as Record<string, unknown>[],
  docs: [] as Record<string, unknown>[],
}));

function filt(rows: Record<string, unknown>[], filters: ChainCtx["filters"]) {
  let out = rows;
  for (const f of filters) {
    const [col, val] = f.args as [string, unknown];
    if (f.method === "eq") out = out.filter((r) => r[col] === val);
    if (f.method === "in") out = out.filter((r) => (val as unknown[]).includes(r[col]));
  }
  return out;
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  if (ctx.op !== "insert" && ctx.op !== "update" && ctx.op !== "delete") {
    if (ctx.table === "subcontractors") return { data: filt(s.subs, ctx.filters), error: null };
    if (ctx.table === "subcontractor_compliance_docs")
      return { data: filt(s.docs, ctx.filters), error: null };
  }
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));
vi.mock("@/lib/format", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/format")>()),
  businessDateISO: () => TODAY,
}));

import {
  getComplianceRisk,
  buildComplianceRiskRow,
} from "@/lib/api/subcontractor-compliance";

beforeEach(() => {
  s.subs = [];
  s.docs = [];
});

// ─── Pure builder — the expired-vs-missing distinction, in isolation ─────────

describe("buildComplianceRiskRow", () => {
  const sub = { id: "a", name: "Ace", trade: "Electrical", status: "active" };

  it("a lapsed REQUIRED doc counts as EXPIRED, not missing (it exists)", () => {
    const row = buildComplianceRiskRow(
      sub,
      [
        { doc_type: "wsib_clearance", title: null, expiry_date: PAST_10 },
        { doc_type: "liability_insurance", title: null, expiry_date: FAR },
      ],
      TODAY
    );
    expect(row.worst).toBe("expired");
    expect(row.expired_docs.map((d) => d.doc_type)).toContain("wsib_clearance");
    // present-but-lapsed is NOT reported as missing
    expect(row.missing_required).toEqual([]);
  });

  it("an ABSENT required type counts as MISSING", () => {
    const row = buildComplianceRiskRow(
      sub,
      [{ doc_type: "liability_insurance", title: null, expiry_date: FAR }],
      TODAY
    );
    expect(row.worst).toBe("missing");
    expect(row.missing_required).toContain("wsib_clearance");
  });

  it("soonest_expiry picks the nearest FUTURE expiry, ignoring past ones", () => {
    const row = buildComplianceRiskRow(
      sub,
      [
        { doc_type: "wsib_clearance", title: null, expiry_date: PAST_10 }, // past — ignored
        { doc_type: "liability_insurance", title: null, expiry_date: FAR },
        { doc_type: "auto_insurance", title: null, expiry_date: SOON_9 },
      ],
      TODAY
    );
    expect(row.soonest_expiry).toBe(SOON_9);
  });

  it("all required present and current → ok", () => {
    const row = buildComplianceRiskRow(
      sub,
      [
        { doc_type: "wsib_clearance", title: null, expiry_date: FAR },
        { doc_type: "liability_insurance", title: null, expiry_date: FAR },
      ],
      TODAY
    );
    expect(row.worst).toBe("ok");
  });
});

// ─── Integration — counts, ordering, active-only scoping ─────────────────────

function seedFullRoster() {
  s.subs = [
    { id: "A", name: "Ace Electric", trade: "Electrical", status: "active" },
    { id: "B", name: "Bolt Mechanical", trade: "HVAC", status: "active" },
    { id: "C", name: "Crown Roofing", trade: "Roofing", status: "active" },
    { id: "D", name: "Delta Drywall", trade: "Drywall", status: "active" },
    { id: "E", name: "Echo Excavation", trade: "Site", status: "inactive" },
  ];
  s.docs = [
    // A — WSIB lapsed (expired), liability valid → EXPIRED
    { subcontractor_id: "A", doc_type: "wsib_clearance", title: null, expiry_date: PAST_10 },
    { subcontractor_id: "A", doc_type: "liability_insurance", title: null, expiry_date: FAR },
    // B — liability only, no WSIB → MISSING
    { subcontractor_id: "B", doc_type: "liability_insurance", title: null, expiry_date: FAR },
    // C — WSIB expiring in 9 days, liability valid → EXPIRING_SOON
    { subcontractor_id: "C", doc_type: "wsib_clearance", title: null, expiry_date: SOON_9 },
    { subcontractor_id: "C", doc_type: "liability_insurance", title: null, expiry_date: FAR },
    // D — both required valid → OK
    { subcontractor_id: "D", doc_type: "wsib_clearance", title: null, expiry_date: FAR },
    { subcontractor_id: "D", doc_type: "liability_insurance", title: null, expiry_date: FAR },
    // E — inactive, everything lapsed (must be excluded entirely)
    { subcontractor_id: "E", doc_type: "wsib_clearance", title: null, expiry_date: PAST_10 },
  ];
}

describe("getComplianceRisk", () => {
  it("counts per worst-state bucket and excludes inactive subs", async () => {
    seedFullRoster();
    const risk = await getComplianceRisk();
    expect(risk.asOf).toBe(TODAY);
    expect(risk.counts).toEqual({ expired: 1, expiring_soon: 1, missing_required: 1, ok: 1 });
    // inactive Echo is nowhere in the rows
    expect(risk.rows.some((r) => r.subcontractor_id === "E")).toBe(false);
  });

  it("orders rows expired → missing → expiring, and excludes ok", async () => {
    seedFullRoster();
    const { rows } = await getComplianceRisk();
    expect(rows.map((r) => r.subcontractor_id)).toEqual(["A", "B", "C"]);
    expect(rows.map((r) => r.worst)).toEqual(["expired", "missing", "expiring_soon"]);
  });

  it("surfaces the specific problem detail per row", async () => {
    seedFullRoster();
    const { rows } = await getComplianceRisk();
    const a = rows.find((r) => r.subcontractor_id === "A")!;
    const b = rows.find((r) => r.subcontractor_id === "B")!;
    const c = rows.find((r) => r.subcontractor_id === "C")!;
    // A: expired WSIB, not missing, soonest = the valid liability (future)
    expect(a.expired_docs.map((d) => d.doc_type)).toEqual(["wsib_clearance"]);
    expect(a.missing_required).toEqual([]);
    expect(a.soonest_expiry).toBe(FAR);
    // B: missing WSIB
    expect(b.missing_required).toContain("wsib_clearance");
    // C: WSIB expiring in exactly 9 days
    expect(c.expiring_docs[0]).toMatchObject({ doc_type: "wsib_clearance", days_until: 9 });
    expect(c.soonest_expiry).toBe(SOON_9);
  });

  it("all-clear: every active sub compliant → zero counts and empty rows", async () => {
    s.subs = [{ id: "D", name: "Delta Drywall", trade: "Drywall", status: "active" }];
    s.docs = [
      { subcontractor_id: "D", doc_type: "wsib_clearance", title: null, expiry_date: FAR },
      { subcontractor_id: "D", doc_type: "liability_insurance", title: null, expiry_date: FAR },
    ];
    const risk = await getComplianceRisk();
    expect(risk.counts).toEqual({ expired: 0, expiring_soon: 0, missing_required: 0, ok: 1 });
    expect(risk.rows).toEqual([]);
  });

  it("no active subcontractors → zero counts and empty rows", async () => {
    s.subs = [];
    const risk = await getComplianceRisk();
    expect(risk.counts).toEqual({ expired: 0, expiring_soon: 0, missing_required: 0, ok: 0 });
    expect(risk.rows).toEqual([]);
  });
});
