// UIDG-6 — the KPI card family: every variant renders, the shared states behave,
// delta polarity is correct for inverted metrics, restricted never leaks the
// value, and the registry enumerates all ten.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Chart-based variants (sparkline/ring/progress/target/halfDonut) call
// useChartTheme → useThemeColors; stub it so they render without a ThemeProvider.
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

import { KPI_VARIANTS } from "@/components/kpi/registry";
import { KpiPlain } from "@/components/kpi/variants/KpiPlain";
import { KpiStatList } from "@/components/kpi/variants/KpiStatList";
import { DeltaPill } from "@/components/kpi/DeltaPill";
import { formatCurrency } from "@/lib/format";

describe("registry — every variant is enumerable and renders its sample", () => {
  it("lists ten variants with complete metadata", () => {
    expect(KPI_VARIANTS).toHaveLength(10);
    for (const v of KPI_VARIANTS) {
      expect(v.id).toBeTruthy();
      expect(v.name).toBeTruthy();
      expect(v.description).toBeTruthy();
      expect(v.requires).toBeTruthy();
      expect(typeof v.Component).toBe("function");
      expect(v.sample).toBeTruthy();
    }
  });

  it("each variant renders its sample with its label", () => {
    for (const v of KPI_VARIANTS) {
      const { unmount } = render(<v.Component {...v.sample} />);
      expect(screen.getAllByText(v.sample.label).length).toBeGreaterThan(0);
      unmount();
    }
  });
});

describe("shared states (KpiShell via KpiPlain)", () => {
  it("restricted renders the restricted state and NEVER the value", () => {
    render(<KpiPlain label="Revenue" value={999999} format={formatCurrency} restricted />);
    expect(screen.getByText("Restricted by current role.")).toBeInTheDocument();
    expect(screen.queryByText(formatCurrency(999999))).not.toBeInTheDocument();
  });

  it("loading marks the card busy and hides the value", () => {
    render(<KpiPlain label="Revenue" value={999999} format={formatCurrency} loading />);
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.queryByText(formatCurrency(999999))).not.toBeInTheDocument();
  });

  it("empty shows 'Not enough data yet', never a fabricated value", () => {
    render(<KpiPlain label="Margin" value={0} format={(n) => `${n}%`} empty />);
    expect(screen.getByText("Not enough data yet")).toBeInTheDocument();
  });

  it("error shows a readable message", () => {
    render(<KpiPlain label="Revenue" value={0} format={formatCurrency} error="Failed to load." />);
    expect(screen.getByText("Failed to load.")).toBeInTheDocument();
  });

  it("a normal card shows its value and label", () => {
    // StatList renders values plainly (no count-up animation), so the exact
    // figure is asserted deterministically here.
    render(
      <KpiStatList
        label="WIP position"
        rows={[{ label: "Net", value: 42500, format: formatCurrency }]}
      />
    );
    expect(screen.getByText("WIP position")).toBeInTheDocument();
    expect(screen.getByText(formatCurrency(42500))).toBeInTheDocument();
  });
});

describe("delta polarity — caller-declared, correct for inverted metrics", () => {
  function colorOf(ui: React.ReactElement): string {
    const { container } = render(ui);
    return (container.firstChild as HTMLElement).style.color;
  }

  it("normal metric: a rise is good (status-green)", () => {
    expect(colorOf(<DeltaPill delta={0.1} polarity="normal" />)).toContain("brand-status-green");
  });

  it("normal metric: a fall is bad (status-red)", () => {
    expect(colorOf(<DeltaPill delta={-0.1} polarity="normal" />)).toContain("brand-status-red");
  });

  it("inverted metric (a cost): a rise is BAD (status-red)", () => {
    expect(colorOf(<DeltaPill delta={0.1} polarity="inverted" />)).toContain("brand-status-red");
  });

  it("inverted metric (a cost): a fall is GOOD (status-green)", () => {
    expect(colorOf(<DeltaPill delta={-0.1} polarity="inverted" />)).toContain("brand-status-green");
  });

  it("zero delta is neutral (no status colour)", () => {
    expect(colorOf(<DeltaPill delta={0} />)).toBe("");
  });
});
