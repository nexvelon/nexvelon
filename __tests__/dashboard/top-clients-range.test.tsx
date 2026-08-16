// UIDG-9 — Top clients now FOLLOWS the global range: it fetches for the resolved
// window, refetches when the window changes, and the fetch path re-applies the
// financials gate (a range-driven refetch must not bypass it).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  action: vi.fn(async (_input?: { from?: string; to?: string }) => ({
    ok: true as const,
    data: [{ client_id: "c1", client_name: "Acme", revenue: 5000, invoice_count: 3 }],
  })),
}));

vi.mock("@/app/(app)/dashboard/actions", () => ({ getTopClientsByRevenueAction: h.action }));

import { TopClientsTable } from "@/components/modules/dashboard/TopClientsTable";
import { DashboardRangeProvider } from "@/components/dashboard/range-context";
import { resolveWindow } from "@/lib/dashboard/range";

beforeEach(() => h.action.mockClear());

function renderAt(from: string, to: string) {
  const win = resolveWindow("custom", { from, to });
  return render(
    <DashboardRangeProvider value={win}>
      <TopClientsTable />
    </DashboardRangeProvider>
  );
}

describe("TopClientsTable follows the global range", () => {
  it("fetches for the resolved window and shows it in the header", async () => {
    renderAt("2026-08-01", "2026-08-31");
    await waitFor(() =>
      expect(h.action).toHaveBeenCalledWith({ from: "2026-08-01", to: "2026-08-31" })
    );
    expect(screen.getByText(/2026-08-01 → 2026-08-31/)).toBeInTheDocument();
    expect(await screen.findByText("Acme")).toBeInTheDocument();
  });

  it("re-applies the gate on the range-driven fetch (denied → restricted, no data)", async () => {
    h.action.mockResolvedValueOnce({ ok: false as const, error: "denied" } as never);
    renderAt("2026-01-01", "2026-12-31");
    await waitFor(() =>
      expect(screen.getByText("Requires financials access.")).toBeInTheDocument()
    );
    expect(screen.queryByText("Acme")).not.toBeInTheDocument();
  });

  it("shows an honest empty state for a range with no revenue (not a zero)", async () => {
    h.action.mockResolvedValueOnce({ ok: true as const, data: [] } as never);
    renderAt("2020-01-01", "2020-01-31");
    expect(await screen.findByText("No invoiced revenue in this range.")).toBeInTheDocument();
  });
});
