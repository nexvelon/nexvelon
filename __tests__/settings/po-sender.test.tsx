import { describe, it, expect, vi, beforeEach } from "vitest";

// PO-3 — unit tests for the PO sender helpers. The company_settings key-value
// store is mocked, so no DB is touched. vi.hoisted makes the fns available to
// the hoisted vi.mock factory below.
const h = vi.hoisted(() => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));

vi.mock("@/lib/api/company-settings", () => ({
  getSetting: h.getSetting,
  setSetting: h.setSetting,
}));

import {
  getPoSenderEmail,
  getPoSenderName,
  getPoSenderFrom,
  setPoSenderEmail,
  PO_SENDER_EMAIL_DEFAULT,
  PO_SENDER_NAME_DEFAULT,
} from "@/lib/settings/po-sender";

beforeEach(() => {
  h.getSetting.mockReset();
  h.setSetting.mockReset();
  h.setSetting.mockResolvedValue(undefined);
});

describe("PO sender settings", () => {
  it("getPoSenderEmail falls back to ceo@nexvelonglobal.com when unset", async () => {
    h.getSetting.mockResolvedValue(null);
    expect(await getPoSenderEmail()).toBe("ceo@nexvelonglobal.com");
    expect(await getPoSenderEmail()).toBe(PO_SENDER_EMAIL_DEFAULT);
  });

  it("getPoSenderName falls back to 'Nexvelon Integrated Solutions' when unset", async () => {
    h.getSetting.mockResolvedValue(null);
    expect(await getPoSenderName()).toBe("Nexvelon Integrated Solutions");
    expect(await getPoSenderName()).toBe(PO_SENDER_NAME_DEFAULT);
  });

  it("getPoSenderFrom returns the 'Name <email>' format from stored values", async () => {
    h.getSetting.mockImplementation(async (k: string) =>
      k === "po_sender_email" ? "ops@nexvelonglobal.com" : "Nexvelon Ops"
    );
    expect(await getPoSenderFrom()).toBe("Nexvelon Ops <ops@nexvelonglobal.com>");
  });

  it("getPoSenderFrom composes the defaults when nothing is stored", async () => {
    h.getSetting.mockResolvedValue(null);
    expect(await getPoSenderFrom()).toBe(
      "Nexvelon Integrated Solutions <ceo@nexvelonglobal.com>"
    );
  });

  it("setPoSenderEmail rejects an address with no @ and does not persist", async () => {
    await expect(setPoSenderEmail("not-an-email")).rejects.toThrow(
      "Invalid email address"
    );
    await expect(setPoSenderEmail("   ")).rejects.toThrow("Invalid email address");
    expect(h.setSetting).not.toHaveBeenCalled();
  });

  it("setPoSenderEmail persists a valid (trimmed) address", async () => {
    await setPoSenderEmail("  ops@nexvelonglobal.com  ");
    expect(h.setSetting).toHaveBeenCalledWith(
      "po_sender_email",
      "ops@nexvelonglobal.com"
    );
  });
});
