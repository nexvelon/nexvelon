// UIDG-8 — the grid's edit chrome: drag handles (keyboard-focusable buttons — the
// keyboard-reorder entry point, backed by dnd-kit's KeyboardSensor +
// sortableKeyboardCoordinates), resize and remove controls appear only in edit
// mode; normal mode has no handles and the widgets stay interactive.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Stub the real (data-fetching, theme-consuming) widget components.
vi.mock("@/components/dashboard/widget-registry", () => ({
  WIDGET_COMPONENTS: {
    kpiOverview: () => <div data-testid="w-kpiOverview" />,
    alerts: () => <div data-testid="w-alerts" />,
    revenueTrend: () => <div data-testid="w-revenueTrend" />,
    quotesByStatus: () => <div />,
    activityFeed: () => <div data-testid="w-activityFeed" />,
    topClients: () => <div />,
    inventoryHealth: () => <div />,
    techUtilization: () => <div />,
  },
}));

import { DashboardGrid } from "@/components/dashboard/DashboardGrid";

const LAYOUT = [
  { id: "revenueTrend" as const, colSpan: 8 },
  { id: "activityFeed" as const, colSpan: 6 },
];

describe("DashboardGrid edit chrome", () => {
  it("edit mode exposes a keyboard-focusable drag handle + resize/remove per widget", () => {
    render(
      <DashboardGrid layout={LAYOUT} editMode onReorder={vi.fn()} onRemove={vi.fn()} onResize={vi.fn()} />
    );
    // The drag handle is a <button> (focusable → keyboard reorder entry point).
    const handle = screen.getByRole("button", { name: "Move Revenue & cash trend" });
    expect(handle.tagName).toBe("BUTTON");
    expect(screen.getByRole("button", { name: "Remove Revenue & cash trend" })).toBeInTheDocument();
    // revenueTrend is resizable → has width controls.
    expect(screen.getByRole("button", { name: "Make Revenue & cash trend wider" })).toBeInTheDocument();
  });

  it("normal mode has no drag handles (widgets are not draggable during use)", () => {
    render(
      <DashboardGrid layout={LAYOUT} editMode={false} onReorder={vi.fn()} onRemove={vi.fn()} onResize={vi.fn()} />
    );
    expect(screen.queryByRole("button", { name: /^Move / })).not.toBeInTheDocument();
    expect(screen.getByTestId("w-revenueTrend")).toBeInTheDocument();
  });

  it("applies each widget's colSpan to the grid cell", () => {
    const { container } = render(
      <DashboardGrid layout={LAYOUT} editMode={false} onReorder={vi.fn()} onRemove={vi.fn()} onResize={vi.fn()} />
    );
    const cells = container.querySelectorAll("[style*='grid-column']");
    expect((cells[0] as HTMLElement).style.gridColumn).toBe("span 8");
    expect((cells[1] as HTMLElement).style.gridColumn).toBe("span 6");
  });
});
