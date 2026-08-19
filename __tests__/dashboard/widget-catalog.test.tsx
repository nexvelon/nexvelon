// UIDG-10 (Step 4) — the catalog lists only PERMITTED widgets (unpermitted ones are
// absent, not disabled — a leakage guard), shows an already-placed widget as
// "Added" and never offers to add it twice (the duplicate rule, 2e), adds via the
// caller's onAdd, and is searchable.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { WidgetCatalog } from "@/components/dashboard/WidgetCatalog";
import { WIDGET_IDS, type WidgetId } from "@/lib/dashboard/widgets";

// A permitted pool WITHOUT any financial widgets (as a Technician would get).
const NON_FINANCIAL: WidgetId[] = [
  "kpiActiveProjects", "kpiOpenQuotes",
  "alerts", "quotesByStatus", "activityFeed", "inventoryHealth", "techUtilization",
];

function open(props: Partial<React.ComponentProps<typeof WidgetCatalog>> = {}) {
  return render(
    <WidgetCatalog
      open
      onOpenChange={() => {}}
      visibleWidgetIds={NON_FINANCIAL}
      placedIds={new Set()}
      onAdd={() => {}}
      {...props}
    />
  );
}

describe("WidgetCatalog", () => {
  it("omits widgets the user cannot see (absent, not disabled)", () => {
    open();
    // a permitted one is listed
    expect(screen.getByText("Active projects")).toBeInTheDocument();
    // financial widgets are NOT in the permitted pool → not rendered at all
    expect(screen.queryByText("Revenue")).not.toBeInTheDocument();
    expect(screen.queryByText("Top clients")).not.toBeInTheDocument();
    // and there is no disabled/greyed control advertising them
    expect(screen.queryByRole("button", { name: /Add Revenue/i })).not.toBeInTheDocument();
  });

  it("shows a placed widget as Added and offers no Add button for it (duplicate rule)", () => {
    open({ placedIds: new Set<WidgetId>(["alerts"]) });
    const alertsRow = screen.getByText("Alerts & worklists").closest("li")!;
    expect(within(alertsRow).getByText("Added")).toBeInTheDocument();
    expect(within(alertsRow).queryByRole("button", { name: /^Add / })).not.toBeInTheDocument();
    // a not-yet-placed widget still has its Add button
    expect(screen.getByRole("button", { name: "Add Active projects" })).toBeInTheDocument();
  });

  it("adds via onAdd when Add is clicked", () => {
    const onAdd = vi.fn();
    open({ onAdd });
    fireEvent.click(screen.getByRole("button", { name: "Add Inventory health" }));
    expect(onAdd).toHaveBeenCalledWith("inventoryHealth");
  });

  it("shows no search box for a small permitted pool", () => {
    open();
    expect(screen.queryByLabelText("Search widgets")).not.toBeInTheDocument();
  });

  it("shows a search box for a large pool and filters by it", () => {
    render(
      <WidgetCatalog
        open
        onOpenChange={() => {}}
        visibleWidgetIds={WIDGET_IDS}
        placedIds={new Set()}
        onAdd={() => {}}
      />
    );
    const search = screen.getByLabelText("Search widgets");
    fireEvent.change(search, { target: { value: "revenue" } });
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.queryByText("Technician utilization")).not.toBeInTheDocument();
  });
});
