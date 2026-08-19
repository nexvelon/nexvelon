// UIDG-10 (2a) — the KPI split must NOT increase query count. However many KPI
// tiles are on the dashboard, the shared provider fires the SAME two actions the
// old combined block fired — exactly once — and fires nothing when no tile is
// present.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  kpis: vi.fn(async () => ({ ok: true as const, data: { financial: null, financial_edit: null, operational: { projects: null, quotes: null }, range: { from: null, to: null }, as_of: "2026-08-18" } })),
  trend: vi.fn(async () => ({ ok: true as const, data: [] as unknown[] })),
}));

vi.mock("@/app/(app)/dashboard/actions", () => ({
  getDashboardKpisAction: h.kpis,
  getRevenueTrendAction: h.trend,
}));

import { KpiDataProvider } from "@/components/dashboard/KpiDataProvider";
import {
  KpiRevenueTile,
  KpiCashTile,
  KpiArTile,
  KpiApTile,
  KpiDepositsTile,
} from "@/components/dashboard/KpiTiles";
import { DashboardRangeProvider } from "@/components/dashboard/range-context";
import { resolveWindow } from "@/lib/dashboard/range";

beforeEach(() => {
  h.kpis.mockClear();
  h.trend.mockClear();
});

function renderWith(active: boolean) {
  return render(
    <DashboardRangeProvider value={resolveWindow("mtd", undefined, new Date(2026, 7, 16, 12))}>
      <KpiDataProvider active={active}>
        {/* five tiles sharing one fetch */}
        <KpiRevenueTile />
        <KpiCashTile />
        <KpiArTile />
        <KpiApTile />
        <KpiDepositsTile />
      </KpiDataProvider>
    </DashboardRangeProvider>
  );
}

describe("KpiDataProvider — shared fetch, no per-tile queries", () => {
  it("fires the two KPI actions exactly once for five tiles", async () => {
    renderWith(true);
    await waitFor(() => expect(h.kpis).toHaveBeenCalledTimes(1));
    expect(h.trend).toHaveBeenCalledTimes(1);
    // the tiles rendered (restricted here, since financial is null) — proving they
    // all read the one shared snapshot rather than fetching their own
    expect((await screen.findAllByText(/Restricted/i)).length).toBeGreaterThan(0);
  });

  it("fires NOTHING when no KPI tile is on the dashboard (active=false)", async () => {
    render(
      <DashboardRangeProvider value={resolveWindow("mtd", undefined, new Date(2026, 7, 16, 12))}>
        <KpiDataProvider active={false}>
          <div>no tiles</div>
        </KpiDataProvider>
      </DashboardRangeProvider>
    );
    // give any stray effect a tick
    await new Promise((r) => setTimeout(r, 0));
    expect(h.kpis).not.toHaveBeenCalled();
    expect(h.trend).not.toHaveBeenCalled();
  });
});
