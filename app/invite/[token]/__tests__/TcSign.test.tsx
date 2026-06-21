import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, forwardRef, useImperativeHandle } from "react";

// POLISH-15 — regression guard for the T&C signing checkbox. The bug that kept
// coming back: after a successful sign the UI rolled back to the unsigned form
// because it relied on a (stale) refetch instead of the action's returned view.
// This test clicks the real checkbox and asserts the signed view actually
// renders — behavioural, not structural.

// A stub signature pad whose ref exposes the methods TcSign calls.
vi.mock("react-signature-canvas", () => ({
  default: forwardRef<unknown, Record<string, unknown>>(function SigStub(_props, ref) {
    useImperativeHandle(ref, () => ({
      isEmpty: () => false,
      clear: () => {},
      getTrimmedCanvas: () => ({ toDataURL: () => "data:image/png;base64,AAAA" }),
      getCanvas: () => ({ toDataURL: () => "data:image/png;base64,AAAA" }),
    }));
    return createElement("canvas", { "data-testid": "sigpad" });
  }),
}));

// vi.hoisted so these are initialised before the hoisted vi.mock factory runs.
const h = vi.hoisted(() => {
  const baseView = {
    token: "tok",
    email: "client@example.com",
    invite_type: "full",
    submitted_at: null,
    client_form_data: null,
    site_form_data: null,
    tier_requested: null,
    tc1_signed_at: null,
    tc1_signed_name: null,
    tc2_signed_at: null,
    tc2_signed_name: null,
    client_form_completed: false,
    site_form_completed: false,
    ready: false,
  } as Record<string, unknown>;
  const signTcAction = vi.fn(
    async (_token: string, which: "tc1" | "tc2", name: string) => ({
      ok: true as const,
      data: {
        ...baseView,
        [`${which}_signed_at`]: "2026-06-21T10:00:00.000Z",
        [`${which}_signed_name`]: name,
      },
    })
  );
  return { baseView, signTcAction };
});

// Mock the whole server-action module so the real server-only chain never loads.
vi.mock("@/app/invite/[token]/actions", () => ({
  getInvitationAction: vi.fn(async () => ({ ok: true, data: { ...h.baseView } })),
  getInviteTermsAction: vi.fn(async () => ({ ok: true, data: "These are the sample terms." })),
  signTcAction: h.signTcAction,
  saveClientFormAction: vi.fn(async () => ({ ok: true })),
  saveSiteFormAction: vi.fn(async () => ({ ok: true })),
  submitInvitationAction: vi.fn(async () => ({ ok: true, data: { submitted: true } })),
  getTierDescriptionsAction: vi.fn(async () => ({ ok: true, data: {} })),
  getTierDisclaimersAction: vi.fn(async () => ({ ok: true, data: { requirements: "", discretion: "" } })),
}));

import { TcSign } from "@/app/invite/[token]/InviteClient";

const signTcAction = h.signTcAction;

beforeEach(() => {
  signTcAction.mockClear();
});

describe("TcSign — T&C signing checkbox", () => {
  it("checks the box and shows 'Signed by …' after a successful sign", async () => {
    const user = userEvent.setup();
    render(<TcSign token="tok" which="tc1" />);

    // Terms load → the signing form (with the name field) appears.
    const nameInput = await screen.findByPlaceholderText("Jane Smith");
    await user.type(nameInput, "Jane Smith");

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);

    // The authoritative signed view must render (this is what regressed).
    await waitFor(() =>
      expect(screen.getByText(/Signed by/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
    expect(signTcAction).toHaveBeenCalledTimes(1);
    expect(signTcAction).toHaveBeenCalledWith(
      "tok",
      "tc1",
      "Jane Smith",
      expect.stringContaining("data:image/png")
    );
  });

  it("does not sign (and reverts) when the name is empty", async () => {
    const user = userEvent.setup();
    render(<TcSign token="tok" which="tc2" />);

    await screen.findByText("These are the sample terms.");
    const checkbox = screen.getByRole("checkbox");
    await user.click(checkbox);

    // No name → action not called, box reverts to unchecked, form still shown.
    expect(signTcAction).not.toHaveBeenCalled();
    expect(checkbox).not.toBeChecked();
    expect(screen.queryByText(/Signed by/i)).not.toBeInTheDocument();
  });
});
