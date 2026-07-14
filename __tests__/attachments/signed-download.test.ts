// SAFARI-FIX follow-up (#310) — getSignedDownloadUrlAction: loads the
// attachment row, gates on the entity resource's :view (downloads are READS —
// not :edit like the upload writes), and signs server-side with a
// Content-Disposition download param. Real permissions matrix; mocked supabase.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string;
    role: string;
    status: string;
  } | null,
  row: {
    id: "att-1",
    entity_type: "product",
    entity_id: "prod-1",
    bucket: "attachments",
    path: "product/prod-1/123-datasheet.pdf",
    filename: "datasheet.pdf",
  } as Record<string, unknown> | null,
  signArgs: [] as { bucket: string; path: string; expires: number; opts: unknown }[],
  signResult: {
    data: { signedUrl: "https://x.co/signed?token=t&download=datasheet.pdf" } as {
      signedUrl: string;
    } | null,
    error: null as { message: string } | null,
  },
}));

vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: h.row, error: null }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, expires: number, opts: unknown) => {
          h.signArgs.push({ bucket, path, expires, opts });
          return h.signResult;
        },
        createSignedUploadUrl: vi.fn(),
        remove: vi.fn(),
      }),
    },
  }),
}));

import { getSignedDownloadUrlAction } from "@/app/(app)/attachments/actions";

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  h.row = {
    id: "att-1",
    entity_type: "product",
    entity_id: "prod-1",
    bucket: "attachments",
    path: "product/prod-1/123-datasheet.pdf",
    filename: "datasheet.pdf",
  };
  h.signArgs = [];
  h.signResult = {
    data: { signedUrl: "https://x.co/signed?token=t&download=datasheet.pdf" },
    error: null,
  };
});

describe("getSignedDownloadUrlAction", () => {
  it("returns not_found for a missing attachment row", async () => {
    h.row = null;
    const res = await getSignedDownloadUrlAction({ attachmentId: "nope" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("not_found");
    expect(h.signArgs).toHaveLength(0);
  });

  it("SUCCEEDS for a viewer (Technician has inventory:view) — reads gate on :view", async () => {
    h.profile = { id: "u1", role: "Technician", status: "Active" };
    const res = await getSignedDownloadUrlAction({ attachmentId: "att-1" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.signedUrl).toContain("signed");
      expect(res.filename).toBe("datasheet.pdf");
    }
  });

  it("is FORBIDDEN without the entity's :view (Subcontractor lacks inventory:view)", async () => {
    h.profile = { id: "u1", role: "Subcontractor", status: "Active" };
    const res = await getSignedDownloadUrlAction({ attachmentId: "att-1" });
    expect(res.ok).toBe(false);
    expect(h.signArgs).toHaveLength(0); // never reached the service role
  });

  it("signs the row's own bucket/path with a 5-minute expiry + download param", async () => {
    const res = await getSignedDownloadUrlAction({ attachmentId: "att-1" });
    expect(res.ok).toBe(true);
    expect(h.signArgs[0]).toEqual({
      bucket: "attachments",
      path: "product/prod-1/123-datasheet.pdf",
      expires: 300,
      opts: { download: "datasheet.pdf" },
    });
  });

  it("surfaces a signing error instead of hanging", async () => {
    h.signResult = { data: null, error: { message: "object not found" } };
    const res = await getSignedDownloadUrlAction({ attachmentId: "att-1" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/object not found/i);
  });
});
