// REP-1 — exportWipReportAction builds the WIP ReportDataset from getWipPortfolio
// and exports it in all three formats, gated financials:edit. An empty portfolio
// produces a valid headers-only file, not an error.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
  portfolio: {
    rows: [
      { project_id: "p1", number: "P-1", title: "Tower", status: "active", contract: 10000, estimated_cost: 6000, actual_cost: 4000, pct_complete: 0.5, earned: 5000, billed: 4000, over_under: -1000, position: "underbilled" },
    ],
    totals: { overbilled: 0, underbilled: -1000, net: -1000 },
  } as { rows: unknown[]; totals: { overbilled: number; underbilled: number; net: number } },
}));

vi.mock("@/lib/api/wip", () => ({ getWipPortfolio: vi.fn(async () => h.portfolio) }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));

import { exportWipReportAction } from "@/app/(app)/reports/actions";

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
});

describe("exportWipReportAction gate", () => {
  it("denies a role without financials:edit (Technician)", async () => {
    h.profile = { id: "u1", role: "Technician", status: "Active" };
    expect((await exportWipReportAction({ format: "csv" })).ok).toBe(false);
  });
  it("Admin and Accountant can export", async () => {
    for (const role of ["Admin", "Accountant"]) {
      h.profile = { id: "u1", role, status: "Active" };
      expect((await exportWipReportAction({ format: "csv" })).ok).toBe(true);
    }
  });
});

describe("exportWipReportAction formats", () => {
  it("csv → text payload with .csv extension + header + data", async () => {
    const r = await exportWipReportAction({ format: "csv" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.filename).toMatch(/\.csv$/);
      expect(r.data.mime).toContain("text/csv");
      expect(r.data.encoding).toBe("text");
      expect(r.data.data).toContain("Project,Title,Status"); // header
      expect(r.data.data).toContain("Tower"); // the one row
    }
  });

  it("xlsx → base64 payload with .xlsx extension + spreadsheet mime", async () => {
    const r = await exportWipReportAction({ format: "xlsx" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.filename).toMatch(/\.xlsx$/);
      expect(r.data.mime).toContain("spreadsheetml");
      expect(r.data.encoding).toBe("base64");
      expect(r.data.data.length).toBeGreaterThan(0);
    }
  });

  it("pdf → base64 payload with .pdf extension", async () => {
    const r = await exportWipReportAction({ format: "pdf" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.filename).toMatch(/\.pdf$/);
      expect(r.data.mime).toBe("application/pdf");
      expect(r.data.data.startsWith("JVBER")).toBe(true); // %PDF
    }
  }, 20_000);
});

describe("empty portfolio", () => {
  it("produces a headers-only CSV, not an error", async () => {
    h.portfolio = { rows: [], totals: { overbilled: 0, underbilled: 0, net: 0 } };
    const r = await exportWipReportAction({ format: "csv" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const lines = r.data.data.trimEnd().split("\r\n");
      expect(lines[0]).toContain("Project,Title"); // header present
      // no data rows — only header + the (always-present) totals row
      expect(lines.length).toBe(2);
    }
  });
});
