// UIDG-10 (Step 5) — the quick-actions bar offers ONLY the create flows the user is
// permitted to perform, each pointing at the real /new route. A user who can create
// nothing gets no bar at all.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Role } from "@/lib/types";
import { hasPermission } from "@/lib/permissions";

const h = vi.hoisted(() => ({ role: "Admin" as Role }));
vi.mock("@/lib/role-context", () => ({ useRole: () => ({ role: h.role }) }));

import { QuickActionsWidget } from "@/components/dashboard/QuickActionsWidget";

function renderAs(role: Role) {
  h.role = role;
  return render(<QuickActionsWidget />);
}

describe("QuickActionsWidget", () => {
  it("shows every create flow an Admin can perform, each linking to its /new route", () => {
    renderAs("Admin");
    const quote = screen.getByRole("link", { name: "Create quote" });
    expect(quote).toHaveAttribute("href", "/quotes/new");
    expect(screen.getByRole("link", { name: "Add client" })).toHaveAttribute("href", "/clients/new");
    expect(screen.getByRole("link", { name: "Add product" })).toHaveAttribute("href", "/inventory/new");
    expect(screen.getByRole("link", { name: "Add site" })).toHaveAttribute("href", "/sites/new");
  });

  it("hides create flows the role cannot perform", () => {
    // A role that cannot create inventory must not see "Add product".
    const noInv = (["SalesRep", "ProjectManager", "Technician", "ViewOnly"] as Role[]).find(
      (r) => !hasPermission(r, "inventory", "create")
    );
    if (noInv) {
      renderAs(noInv);
      expect(screen.queryByRole("link", { name: "Add product" })).not.toBeInTheDocument();
    }
  });

  it("renders nothing when the user can perform no create flow", () => {
    // Pick a role with none of clients/quotes/inventory create.
    const noneRole = (["ViewOnly", "Technician", "Subcontractor", "Warehouse"] as Role[]).find(
      (r) =>
        !hasPermission(r, "clients", "create") &&
        !hasPermission(r, "quotes", "create") &&
        !hasPermission(r, "inventory", "create")
    )!;
    const { container } = renderAs(noneRole);
    expect(container).toBeEmptyDOMElement();
  });
});
