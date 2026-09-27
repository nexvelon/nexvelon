// MAIL-2 — updateEmailAddressAction: admin-gated, validates, warns on
// off-domain, and writes a settings_audit_log row naming the setting + before/after.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  admin: true,
  getSetting: vi.fn(async () => null as string | null),
  setSetting: vi.fn(async () => {}),
  insertAuditRow: vi.fn(async () => ({})),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions/resolve", () => ({
  requireAdmin: async () =>
    h.admin
      ? { ok: true, profile: { id: "u1", email: "admin@nexvelonglobal.com", display_name: "Ada Admin", first_name: "Ada", last_name: "Admin" } }
      : { ok: false, error: "Admin access required." },
}));
vi.mock("@/lib/api/company-settings", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getSetting: h.getSetting,
  setSetting: h.setSetting,
}));
vi.mock("@/lib/api/settings-audit", () => ({ insertAuditRow: h.insertAuditRow }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import {
  updateEmailAddressAction,
} from "@/app/(app)/settings/company-settings-actions";
import { EMAIL_ADDRESS_KEYS } from "@/lib/email/addresses";

beforeEach(() => {
  h.admin = true;
  h.getSetting.mockClear();
  h.getSetting.mockResolvedValue(null);
  h.setSetting.mockClear();
  h.insertAuditRow.mockClear();
});

describe("updateEmailAddressAction", () => {
  it("saves a valid address and writes an audit row (setting key + before/after + who)", async () => {
    h.getSetting.mockResolvedValueOnce("quotes@nexvelonglobal.com");
    const res = await updateEmailAddressAction({ field: "clientFrom", value: "sales@nexvelonglobal.com" });
    expect(res.ok).toBe(true);
    expect(h.setSetting).toHaveBeenCalledWith(EMAIL_ADDRESS_KEYS.clientFrom, "sales@nexvelonglobal.com");
    expect(h.insertAuditRow).toHaveBeenCalledWith(
      expect.objectContaining({
        setting_key: EMAIL_ADDRESS_KEYS.clientFrom,
        before_text: "quotes@nexvelonglobal.com",
        after_text: "sales@nexvelonglobal.com",
        edited_by_user_id: "u1",
        edited_by_name: "Ada Admin",
        action_type: "edit",
      })
    );
    if (res.ok) expect(res.data.warning).toBeNull();
  });

  it("records the in-code default as the 'before' when the key was unset", async () => {
    h.getSetting.mockResolvedValueOnce(null);
    await updateEmailAddressAction({ field: "ordersGuardian", value: "ng@nexvelonglobal.com" });
    expect(h.insertAuditRow).toHaveBeenCalledWith(
      expect.objectContaining({ before_text: expect.stringContaining("NGorders@nexvelonglobal.com") })
    );
  });

  it("rejects an invalid address without storing or auditing", async () => {
    const res = await updateEmailAddressAction({ field: "clientBcc", value: "not-an-email" });
    expect(res.ok).toBe(false);
    expect(h.setSetting).not.toHaveBeenCalled();
    expect(h.insertAuditRow).not.toHaveBeenCalled();
  });

  it("saves but WARNS when the address is off the sending domain", async () => {
    const res = await updateEmailAddressAction({ field: "clientFrom", value: "someone@gmail.com" });
    expect(res.ok).toBe(true);
    expect(h.setSetting).toHaveBeenCalled();
    if (res.ok) expect(res.data.warning).toMatch(/nexvelonglobal\.com/);
  });

  it("is admin-gated", async () => {
    h.admin = false;
    const res = await updateEmailAddressAction({ field: "clientFrom", value: "x@nexvelonglobal.com" });
    expect(res.ok).toBe(false);
    expect(h.setSetting).not.toHaveBeenCalled();
  });
});
