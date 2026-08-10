// AUD-2 — sites and contacts now roll their create/update/delete events up onto
// the parent client's Activity timeline, carrying a human-readable label that
// survives the child's deletion. These tests pin the rollup ctx handed to
// logActivity on the paths that previously logged bare rows.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  logActivity: vi.fn(async () => {}),
  createSite: vi.fn(),
  createContact: vi.fn(),
  deleteContact: vi.fn(async () => true),
  contactRow: null as Record<string, unknown> | null,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/profile", () => ({
  getCurrentProfile: async () => ({ id: "u1", role: "Admin", status: "Active" }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/api/invitation-storage", () => ({ deleteInvitationStorage: vi.fn() }));
vi.mock("@/lib/api/activity-log", () => ({
  logActivity: h.logActivity,
  computeChanges: () => ({}),
}));
vi.mock("@/lib/api/clients", () => ({
  createSite: h.createSite,
  createContact: h.createContact,
  deleteContact: h.deleteContact,
  // unused-by-these-tests exports still need to resolve:
  createClient: vi.fn(), deleteClient: vi.fn(), deleteSite: vi.fn(),
  getClientById: vi.fn(), getClients: vi.fn(), getContactsByClient: vi.fn(),
  getSitesByClient: vi.fn(), listSites: vi.fn(), updateClient: vi.fn(),
  updateContact: vi.fn(), updateSite: vi.fn(),
}));
// getContactByIdForDiff reads contacts.* through the server client.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: h.contactRow, error: null }) }),
      }),
    }),
  }),
}));

import { createSiteAction, deleteContactAction } from "@/app/(app)/clients/actions";

beforeEach(() => {
  h.logActivity.mockClear();
  h.createSite.mockReset();
  h.createContact.mockReset();
  h.deleteContact.mockClear();
  h.contactRow = null;
});

describe("createSiteAction — rolls up to the client", () => {
  it("logs the site create with parent client + site name label", async () => {
    h.createSite.mockResolvedValue({ id: "s1", client_id: "c9", name: "Main St Depot" });
    const res = await createSiteAction({ client_id: "c9", name: "Main St Depot" } as never);
    expect(res.ok).toBe(true);
    expect(h.logActivity).toHaveBeenCalledWith("site", "s1", "create", {}, {
      parentType: "client",
      parentId: "c9",
      entityLabel: "Main St Depot",
    });
  });
});

describe("deleteContactAction — rolls up to the client", () => {
  it("captures the name before delete so the removed row stays readable", async () => {
    h.contactRow = {
      id: "k1", client_id: "c9", site_id: null,
      first_name: "Jane", last_name: "Doe",
    };
    const res = await deleteContactAction("k1");
    expect(res.ok).toBe(true);
    expect(h.logActivity).toHaveBeenCalledWith("contact", "k1", "delete", {}, {
      parentType: "client",
      parentId: "c9",
      entityLabel: "Jane Doe",
    });
  });

  it("falls back to the site parent for a site-scoped contact", async () => {
    h.contactRow = {
      id: "k2", client_id: null, site_id: "s5",
      first_name: "Sam", last_name: "Reed",
    };
    const res = await deleteContactAction("k2");
    expect(res.ok).toBe(true);
    expect(h.logActivity).toHaveBeenCalledWith("contact", "k2", "delete", {}, {
      parentType: "site",
      parentId: "s5",
      entityLabel: "Sam Reed",
    });
  });
});
