// PROJ2-13 — the commissioning API. createRun, addItem/setItemResult, sign-off
// blocked while items are pending, the happy path (stamps signature + status +
// pdf_path), the §2.8 guarantee that a PDF failure does NOT roll back the
// sign-off, and raiseDeficiencyFromItem creating + linking a deficiency.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  run: null as Record<string, unknown> | null,
  items: [] as Record<string, unknown>[],
  project: { opco: "integrated_solutions", project_number: "P-001", title: "Tower" } as Record<string, unknown> | null,
  runUpdates: [] as Record<string, unknown>[],
  itemInserts: [] as Record<string, unknown>[],
  itemUpdates: [] as { id: unknown; payload: Record<string, unknown> }[],
  renderPdf: vi.fn(async () => Buffer.from("PDF")),
  uploadPdf: vi.fn(async () => ({ path: "run1/certificate_1.pdf", signedUrl: null })),
  signPdf: vi.fn(async () => "https://signed/cert"),
  createDeficiency: vi.fn(async () => ({ id: "def-1" })),
  logActivity: vi.fn(async () => {}),
}));

function filt(rows: Record<string, unknown>[], filters: ChainCtx["filters"]) {
  let out = rows;
  for (const f of filters) {
    const args = f.args as unknown[];
    const col = args[0] as string;
    if (f.method === "eq") out = out.filter((r) => r[col] === args[1]);
  }
  return out;
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  const single = ctx.terminal === "single" || ctx.terminal === "maybeSingle";
  if (ctx.table === "commissioning_runs") {
    if (ctx.op === "insert") {
      const p = ctx.payload as Record<string, unknown>;
      h.run = { id: "run1", ...p };
      return { data: h.run, error: null };
    }
    if (ctx.op === "update") {
      h.runUpdates.push(ctx.payload as Record<string, unknown>);
      h.run = { ...(h.run ?? {}), ...(ctx.payload as object) };
      return { data: h.run, error: null };
    }
    return { data: h.run, error: null };
  }
  if (ctx.table === "commissioning_items") {
    if (ctx.op === "insert") {
      const payloads = Array.isArray(ctx.payload) ? ctx.payload : [ctx.payload];
      for (const p of payloads as Record<string, unknown>[]) {
        const row = { id: `it-${h.itemInserts.length + 1}`, ...p };
        h.itemInserts.push(p);
        h.items = [...h.items, row];
      }
      return { data: h.items[h.items.length - 1], error: null };
    }
    if (ctx.op === "update") {
      const id = ctx.filters.find((f) => f.method === "eq")?.args[1];
      h.itemUpdates.push({ id, payload: ctx.payload as Record<string, unknown> });
      h.items = h.items.map((r) => (r.id === id ? { ...r, ...(ctx.payload as object) } : r));
      return { data: h.items.find((r) => r.id === id) ?? null, error: null };
    }
    const rows = filt(h.items, ctx.filters);
    return { data: single ? (rows[0] ?? null) : rows, error: null };
  }
  if (ctx.table === "projects") return { data: h.project, error: null };
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));
vi.mock("@/lib/api/sub-agreements", () => ({ jobLabel: () => "Main Job" }));
vi.mock("@/lib/api/job-deficiencies", () => ({ createDeficiency: h.createDeficiency }));
vi.mock("@/lib/pdf/render-commissioning", () => ({ renderCommissioningPdf: h.renderPdf }));
vi.mock("@/lib/storage/commissioning-pdfs", () => ({
  uploadCommissioningPdf: h.uploadPdf,
  signCommissioningPdf: h.signPdf,
}));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: h.logActivity }));

import {
  createRun,
  addItem,
  setItemResult,
  signOffRun,
  raiseDeficiencyFromItem,
} from "@/lib/api/commissioning";

function seedRun(over: Record<string, unknown> = {}) {
  h.run = {
    id: "run1",
    project_id: "p1",
    job_id: "job1",
    title: "Commissioning",
    status: "in_progress",
    performed_by: "Tech A",
    performed_at: "2026-07-20",
    witnessed_by: null,
    signed_off_at: null,
    signed_off_by: null,
    signature_data: null,
    signer_name: null,
    signer_title: null,
    pdf_path: null,
    notes: null,
    job: null,
    project: { project_number: "P-001" },
    items: [],
    ...over,
  };
}

beforeEach(() => {
  h.items = [];
  h.runUpdates = [];
  h.itemInserts = [];
  h.itemUpdates = [];
  h.project = { opco: "integrated_solutions", project_number: "P-001", title: "Tower" };
  h.renderPdf.mockClear();
  h.renderPdf.mockImplementation(async () => Buffer.from("PDF"));
  h.uploadPdf.mockClear();
  h.createDeficiency.mockClear();
  seedRun();
});

describe("createRun + items", () => {
  it("creates an in-progress run", async () => {
    const run = await createRun({ projectId: "p1", jobId: "job1", performedBy: "Tech A" });
    expect(run.status).toBe("in_progress");
  });

  it("addItem requires a description and defaults result to pending", async () => {
    await expect(addItem({ runId: "run1", description: "  " })).rejects.toMatchObject({
      code: "invalid_description",
    });
    await addItem({ runId: "run1", description: "Camera 1 online" });
    expect(h.itemInserts.at(-1)).toMatchObject({ description: "Camera 1 online", result: "pending" });
  });

  it("setItemResult writes the result", async () => {
    h.items = [{ id: "it1", run_id: "run1", description: "x", result: "pending" }];
    await setItemResult("it1", "pass");
    expect(h.itemUpdates.at(-1)!.payload).toMatchObject({ result: "pass" });
  });
});

describe("signOffRun", () => {
  it("is blocked while any item is pending ('items_pending') and does not stamp", async () => {
    h.items = [
      { id: "it1", run_id: "run1", description: "a", result: "pass" },
      { id: "it2", run_id: "run1", description: "b", result: "pending" },
    ];
    const res = await signOffRun({ runId: "run1", signerName: "Jane", signatureData: "data:png" });
    expect(res.ok).toBe(false);
    if (!res.ok && "pendingCount" in res) {
      expect(res.error).toBe("items_pending");
      expect(res.pendingCount).toBe(1);
    } else {
      throw new Error("expected items_pending");
    }
    // status never flipped
    expect(h.runUpdates.some((u) => u.status === "signed_off")).toBe(false);
  });

  it("happy path stamps signature + status + pdf_path", async () => {
    h.items = [
      { id: "it1", run_id: "run1", description: "a", result: "pass" },
      { id: "it2", run_id: "run1", description: "b", result: "na" },
    ];
    const res = await signOffRun({
      runId: "run1", signerName: "Jane Smith", signerTitle: "Consultant",
      signatureData: "data:image/png;base64,xxx", actorId: "u1",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.warning).toBeUndefined();
      expect(res.pdfPath).toBe("run1/certificate_1.pdf");
    }
    expect(h.renderPdf).toHaveBeenCalledTimes(1);
    expect(h.uploadPdf).toHaveBeenCalledTimes(1);
    // the stamp update carried the signature + signed_off status
    const stamp = h.runUpdates.find((u) => u.status === "signed_off")!;
    expect(stamp).toMatchObject({
      status: "signed_off",
      signature_data: "data:image/png;base64,xxx",
      signer_name: "Jane Smith",
      signer_title: "Consultant",
    });
    expect(stamp.signed_off_at).toBeTruthy();
    // a later update wrote the pdf_path
    expect(h.runUpdates.some((u) => u.pdf_path === "run1/certificate_1.pdf")).toBe(true);
  });

  it("a PDF failure does NOT roll back the sign-off (§2.8) — status stays signed_off + warning", async () => {
    h.items = [{ id: "it1", run_id: "run1", description: "a", result: "pass" }];
    h.renderPdf.mockImplementationOnce(async () => {
      throw new Error("renderToBuffer boom");
    });
    const res = await signOffRun({ runId: "run1", signerName: "Jane", signatureData: "data:png" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.warning).toMatch(/certificate PDF failed/i);
      expect(res.pdfPath).toBeNull();
    }
    // the sign-off stamp still happened
    expect(h.run?.status).toBe("signed_off");
    expect(h.run?.signature_data).toBe("data:png");
  });

  it("refuses to sign off an already signed-off run", async () => {
    seedRun({ status: "signed_off" });
    const res = await signOffRun({ runId: "run1", signerName: "Jane", signatureData: "data:png" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/already signed off/i);
  });
});

describe("raiseDeficiencyFromItem", () => {
  it("creates a deficiency from a failed item and links it", async () => {
    h.items = [
      { id: "it1", run_id: "run1", description: "Camera 4 offline", actual_note: "no video", category: "CCTV", deficiency_id: null },
    ];
    const res = await raiseDeficiencyFromItem({ itemId: "it1", actorId: "u1" });
    expect(res.deficiencyId).toBe("def-1");
    expect(h.createDeficiency).toHaveBeenCalledTimes(1);
    // the created deficiency carries the item's description + severity major
    expect((h.createDeficiency.mock.calls[0] as unknown[])[0]).toMatchObject({
      projectId: "p1",
      jobId: "job1",
      severity: "major",
    });
    // the item was linked back to the deficiency
    expect(h.itemUpdates.at(-1)!.payload).toMatchObject({ deficiency_id: "def-1" });
  });
});
