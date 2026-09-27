// MAIL-2 — operational email addresses as settings:
//   • each address resolves from company_settings, falling back to its default
//     when the row is absent or blank, and never throws (a failed read → defaults);
//   • the per-opco order address resolves correctly for each opco;
//   • format validation + the outside-domain check behave as the Settings action needs.

import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  rows: [] as { key: string; value: string | null }[],
  fail: false,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        in: async () => (h.fail ? { data: null, error: { message: "boom" } } : { data: h.rows, error: null }),
      }),
    }),
  }),
}));

import {
  getEmailAddresses,
  orderAddressForOpco,
  extractEmail,
  isValidEmailSetting,
  isOnSendingDomain,
  EMAIL_ADDRESS_DEFAULTS,
  EMAIL_ADDRESS_KEYS,
} from "@/lib/email/addresses";

beforeEach(() => {
  h.rows = [];
  h.fail = false;
});

describe("getEmailAddresses — settings with safe fallback", () => {
  it("returns the in-code defaults when nothing is stored", async () => {
    const a = await getEmailAddresses();
    expect(a).toEqual(EMAIL_ADDRESS_DEFAULTS);
  });

  it("uses a stored value when present", async () => {
    h.rows = [{ key: EMAIL_ADDRESS_KEYS.clientFrom, value: "sales@nexvelonglobal.com" }];
    const a = await getEmailAddresses();
    expect(a.clientFrom).toBe("sales@nexvelonglobal.com");
    expect(a.clientBcc).toBe(EMAIL_ADDRESS_DEFAULTS.clientBcc); // untouched → default
  });

  it("falls back to the default when a stored value is blank", async () => {
    h.rows = [{ key: EMAIL_ADDRESS_KEYS.clientBcc, value: "   " }];
    const a = await getEmailAddresses();
    expect(a.clientBcc).toBe(EMAIL_ADDRESS_DEFAULTS.clientBcc);
  });

  it("never throws — a failed read returns the full defaults so sending is never blocked", async () => {
    h.fail = true;
    const a = await getEmailAddresses();
    expect(a).toEqual(EMAIL_ADDRESS_DEFAULTS);
  });
});

describe("orderAddressForOpco (§2.6)", () => {
  it("resolves each opco's own order address", async () => {
    const a = await getEmailAddresses();
    expect(orderAddressForOpco(a, "integrated_solutions")).toBe("NISorders@nexvelonglobal.com");
    expect(orderAddressForOpco(a, "guardian")).toBe("NGorders@nexvelonglobal.com");
  });

  it("honors overridden per-opco addresses", async () => {
    h.rows = [
      { key: EMAIL_ADDRESS_KEYS.ordersIntegratedSolutions, value: "nis@nexvelonglobal.com" },
      { key: EMAIL_ADDRESS_KEYS.ordersGuardian, value: "ng@nexvelonglobal.com" },
    ];
    const a = await getEmailAddresses();
    expect(orderAddressForOpco(a, "integrated_solutions")).toBe("nis@nexvelonglobal.com");
    expect(orderAddressForOpco(a, "guardian")).toBe("ng@nexvelonglobal.com");
  });
});

describe("validation", () => {
  it("extracts the bare email from a plain address or a 'Name <email>' header", () => {
    expect(extractEmail("a@b.com")).toBe("a@b.com");
    expect(extractEmail("Nexvelon <noreply@nexvelonglobal.com>")).toBe("noreply@nexvelonglobal.com");
    expect(extractEmail("not an email")).toBeNull();
  });
  it("accepts valid, rejects invalid", () => {
    expect(isValidEmailSetting("quotes@nexvelonglobal.com")).toBe(true);
    expect(isValidEmailSetting("nope")).toBe(false);
    expect(isValidEmailSetting("")).toBe(false);
  });
  it("flags addresses outside the sending domain (warn, not block)", () => {
    expect(isOnSendingDomain("quotes@nexvelonglobal.com")).toBe(true);
    expect(isOnSendingDomain("Nexvelon <quotes@nexvelonglobal.com>")).toBe(true);
    expect(isOnSendingDomain("someone@gmail.com")).toBe(false);
  });
});

describe("SecurityServices@ is gone", () => {
  it("does not appear in company-profile.ts or the document components", () => {
    const files = [
      "lib/company-profile.ts",
      "components/modules/purchase-orders/PurchaseOrderDocument.tsx",
      "components/modules/inventory/PickupSlipDocument.tsx",
      "components/modules/inventory/RmaDocument.tsx",
      "components/modules/subcontractors/WorkOrderDocument.tsx",
      "components/modules/projects/CommissioningCertificate.tsx",
    ];
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      expect(src, `${f} still references SecurityServices@`).not.toMatch(/SecurityServices@/i);
    }
  });
});
