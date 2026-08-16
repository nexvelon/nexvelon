// UIDG-9 — the per-widget chrome: registry-driven controls (refresh/expand/menu),
// refresh remounts only this widget (→ it refetches), expand opens a dialog, and
// every control is a keyboard-focusable button.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ mounts: 0 }));

vi.mock("@/components/dashboard/widget-registry", () => {
  const Stub = () => {
    // count mounts so a refresh (remount) is observable
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return <div data-testid="stub" data-mounts={++h.mounts} />;
  };
  return {
    WIDGET_COMPONENTS: {
      revenueTrend: Stub,
      kpiOverview: Stub, alerts: Stub, quotesByStatus: Stub, activityFeed: Stub,
      topClients: Stub, inventoryHealth: Stub, techUtilization: Stub,
    },
  };
});

import { WidgetFrame } from "@/components/dashboard/WidgetFrame";

beforeEach(() => {
  h.mounts = 0;
});

describe("WidgetFrame chrome", () => {
  it("renders refresh, expand and overflow — all keyboard-focusable buttons", () => {
    render(<WidgetFrame id="revenueTrend" onRemove={vi.fn()} />);
    for (const name of [
      "Refresh Revenue & cash trend",
      "Expand Revenue & cash trend",
      "Revenue & cash trend options",
    ]) {
      const el = screen.getByRole("button", { name });
      expect(el.tagName).toBe("BUTTON");
    }
  });

  it("refresh remounts the widget so it refetches its own data", () => {
    render(<WidgetFrame id="revenueTrend" onRemove={vi.fn()} />);
    const before = Number(screen.getByTestId("stub").getAttribute("data-mounts"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh Revenue & cash trend" }));
    const after = Number(screen.getByTestId("stub").getAttribute("data-mounts"));
    expect(after).toBeGreaterThan(before); // remounted
  });

  it("expand opens a dialog containing the widget, and Escape closes it", async () => {
    render(<WidgetFrame id="revenueTrend" onRemove={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand Revenue & cash trend" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Revenue & cash trend")).toBeInTheDocument();
    // keyboard-dismissable
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows a last-updated stamp (never silently stale)", () => {
    render(<WidgetFrame id="revenueTrend" onRemove={vi.fn()} />);
    expect(screen.getByText(/^Updated /)).toBeInTheDocument();
  });
});
