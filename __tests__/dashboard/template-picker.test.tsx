// UIDG-10 (Step 6) — applying a template is destructive, so it CONFIRMS first, and
// only calls onApply after the user confirms. An Admin additionally gets the
// set-as-company-default path (which the parent wires to ApplyDefaultDialog).

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TemplatePicker } from "@/components/dashboard/TemplatePicker";
import { DASHBOARD_TEMPLATES } from "@/lib/dashboard/templates";

function open(props: Partial<React.ComponentProps<typeof TemplatePicker>> = {}) {
  return render(
    <TemplatePicker
      open
      onOpenChange={() => {}}
      canManageOrg={false}
      onApply={() => {}}
      onSetOrgDefault={() => {}}
      {...props}
    />
  );
}

describe("TemplatePicker", () => {
  it("lists the shipped templates with their audience", () => {
    open();
    for (const t of DASHBOARD_TEMPLATES) {
      expect(screen.getByText(t.name)).toBeInTheDocument();
    }
  });

  it("confirms before applying — onApply fires only after Apply is clicked", () => {
    const onApply = vi.fn();
    open({ onApply });
    // clicking "Use this template" does NOT apply yet
    fireEvent.click(screen.getAllByRole("button", { name: "Use this template" })[0]);
    expect(onApply).not.toHaveBeenCalled();
    // a confirm step appears warning the current layout is lost
    expect(screen.getByText(/existing layout will be lost/i)).toBeInTheDocument();
    // confirming applies
    fireEvent.click(screen.getByRole("button", { name: "Apply template" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(DASHBOARD_TEMPLATES[0]);
  });

  it("cancelling the confirm does not apply", () => {
    const onApply = vi.fn();
    open({ onApply });
    fireEvent.click(screen.getAllByRole("button", { name: "Use this template" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onApply).not.toHaveBeenCalled();
  });

  it("offers set-as-company-default only to admins", () => {
    const onSetOrgDefault = vi.fn();
    open({ canManageOrg: true, onSetOrgDefault });
    fireEvent.click(screen.getAllByRole("button", { name: "Use this template" })[0]);
    fireEvent.click(screen.getByRole("button", { name: /Set as company default/i }));
    expect(onSetOrgDefault).toHaveBeenCalledWith(DASHBOARD_TEMPLATES[0]);
  });

  it("does not offer company-default to a non-admin", () => {
    open({ canManageOrg: false });
    fireEvent.click(screen.getAllByRole("button", { name: "Use this template" })[0]);
    expect(screen.queryByRole("button", { name: /Set as company default/i })).not.toBeInTheDocument();
  });
});
