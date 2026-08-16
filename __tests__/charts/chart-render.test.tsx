// UIDG-5 — the three states render consistently, a form drops into them, and a
// migrated chart keeps its role gating (a restricted read shows the error state,
// never a chart / never data).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// useChartTheme reads useThemeColors — stub it with a fixed resolved palette so
// the forms render without a ThemeProvider.
vi.mock("@/lib/theme-context", () => ({
  useThemeColors: () => ({
    key: "t", name: "T", description: "",
    primary: "#0A1226", accent: "#B8924B", accentSoft: "#9A7B3A",
    bg: "#fff", text: "#1A1F2E", card: "#fff", border: "#e5e5e5", muted: "#f4f4f4",
    sidebarAccent: "#000", sidebarBorder: "#000",
    chartTertiary: "#5C6A8A", chartQuaternary: "#A8B0C4",
    statusGreen: "#4F6A3C", statusRed: "#8a3b3b", fonts: {},
    charts: ["#0A1226", "#B8924B", "#5C6A8A", "#A8B0C4", "#1A1F2E"],
  }),
}));

import { ChartFrame } from "@/components/charts/ChartFrame";
import { BarChart } from "@/components/charts";

const chart = <div data-testid="inner" />;

describe("ChartFrame — the three states", () => {
  it("loading renders a busy skeleton, not the chart", () => {
    render(<ChartFrame summary="X" loading>{chart}</ChartFrame>);
    expect(screen.queryByTestId("inner")).not.toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it("empty renders 'Not enough data yet' (never a blank axis)", () => {
    render(<ChartFrame summary="X" empty>{chart}</ChartFrame>);
    expect(screen.getByText("Not enough data yet")).toBeInTheDocument();
    expect(screen.queryByTestId("inner")).not.toBeInTheDocument();
  });

  it("a custom empty message is honoured", () => {
    render(<ChartFrame summary="X" empty emptyMessage="No stock on hand.">{chart}</ChartFrame>);
    expect(screen.getByText("No stock on hand.")).toBeInTheDocument();
  });

  it("error renders a readable message, never a blank box", () => {
    render(<ChartFrame summary="X" error="Requires access.">{chart}</ChartFrame>);
    expect(screen.getByText("Requires access.")).toBeInTheDocument();
  });

  it("ready gives the chart an accessible text alternative (role=img + label)", () => {
    render(<ChartFrame summary="Revenue by month">{chart}</ChartFrame>);
    expect(screen.getByRole("img", { name: "Revenue by month" })).toBeInTheDocument();
  });
});

describe("a form drops into the shared states", () => {
  it("BarChart with no data shows the empty state", () => {
    render(
      <BarChart summary="Units by category" data={[]} xKey="c" series={[{ key: "units" }]} />
    );
    expect(screen.getByText("Not enough data yet")).toBeInTheDocument();
  });

  it("BarChart with data renders the accessible chart frame", () => {
    render(
      <BarChart
        summary="Units by category"
        data={[{ c: "A", units: 3 }, { c: "B", units: 5 }]}
        xKey="c"
        series={[{ key: "units" }]}
      />
    );
    expect(screen.getByRole("img", { name: "Units by category" })).toBeInTheDocument();
  });
});

describe("migrated chart — role gating preserved", () => {
  it("RevenueTrendChart shows the restricted error state, never a chart", async () => {
    vi.doMock("@/app/(app)/dashboard/actions", () => ({
      getRevenueTrendAction: async () => ({ ok: false, error: "denied" }),
    }));
    const { RevenueTrendChart } = await import(
      "@/components/modules/dashboard/RevenueTrendChart"
    );
    render(<RevenueTrendChart />);
    await waitFor(() =>
      expect(screen.getByText("Requires financials access.")).toBeInTheDocument()
    );
    // The frame is in its ERROR state (label carries the restriction), not a data
    // chart — the gate was preserved through the migration.
    const frame = screen.getByRole("img");
    expect(frame.getAttribute("aria-label")).toContain("Requires financials access.");
    expect(document.querySelector("svg")).toBeNull();
  });
});
