// QUOTES-4 — smoke coverage for the row-action gating shipped in QUOTES-2/3.
// Tests the QuoteRowActions menu directly (it owns the Send-disabled + Delete
// role/status gating and, unlike the list page's server component, pulls in no
// server-only modules). The server-side guards are covered separately by the
// actions; this asserts the UX gates the user actually sees.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Quote } from "@/lib/types";

// jsdom lacks these; Base UI's menu (floating-ui) needs them to open.
beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
  // Base UI may call these during open/focus management.
  Element.prototype.scrollIntoView ??= () => {};
});

// Control the effective role for the permission gate (Admin gets Delete).
let mockRole = "Admin";
vi.mock("@/lib/role-context", () => ({
  useRole: () => ({ role: mockRole, grants: [] }),
}));

import { QuoteRowActions } from "@/components/modules/quotes/QuoteRowActions";

function makeQuote(overrides: Partial<Quote>): Quote {
  return {
    id: "q-smoke",
    number: "Q-SMOKE-1",
    status: "Draft",
    clientId: "",
    siteId: undefined,
    ...overrides,
  } as unknown as Quote;
}

function renderActions(role: string, quote: Quote) {
  mockRole = role;
  const handlers = {
    onView: vi.fn(),
    onDuplicate: vi.fn(),
    onSend: vi.fn(),
    onApprove: vi.fn(),
    onConvert: vi.fn(),
    onArchive: vi.fn(),
    onDelete: vi.fn(),
  };
  render(<QuoteRowActions quote={quote} {...handlers} />);
  return handlers;
}

async function openMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /row actions/i }));
  return user;
}

describe("QuoteRowActions — QUOTES-2/3 gating", () => {
  it("shows Send to Client but DISABLED when a Draft has no client/site", async () => {
    renderActions("Admin", makeQuote({ status: "Draft", clientId: "", siteId: undefined }));
    await openMenu();

    const send = await screen.findByText("Send to Client");
    const item = send.closest('[role="menuitem"]') ?? send.parentElement!;
    expect(item).toHaveAttribute("aria-disabled", "true");
  });

  it("enables Send to Client and fires onSend once a Draft has client + site", async () => {
    const handlers = renderActions(
      "Admin",
      makeQuote({ status: "Draft", clientId: "c1", siteId: "s1" })
    );
    const user = await openMenu();

    const send = await screen.findByText("Send to Client");
    const item = send.closest('[role="menuitem"]') ?? send.parentElement!;
    expect(item).not.toHaveAttribute("aria-disabled", "true");
    await user.click(send);
    expect(handlers.onSend).toHaveBeenCalledTimes(1);
  });

  it("shows Delete for an Admin on a Draft and fires onDelete on click", async () => {
    const handlers = renderActions("Admin", makeQuote({ status: "Draft" }));
    const user = await openMenu();

    const del = await screen.findByText("Delete");
    await user.click(del);
    expect(handlers.onDelete).toHaveBeenCalledTimes(1);
  });

  it("HIDES Delete for a non-admin (SalesRep) even on a Draft", async () => {
    renderActions("SalesRep", makeQuote({ status: "Draft" }));
    await openMenu();

    await screen.findByText("Duplicate"); // menu is open
    expect(screen.queryByText("Delete")).toBeNull();
  });

  it("HIDES Delete for an Admin on a non-Draft (Sent) quote", async () => {
    renderActions("Admin", makeQuote({ status: "Sent", clientId: "c1", siteId: "s1" }));
    await openMenu();

    await screen.findByText("Duplicate"); // menu is open
    expect(screen.queryByText("Delete")).toBeNull();
  });
});
