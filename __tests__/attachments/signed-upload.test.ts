// SAFARI-FIX — the signed-URL upload flow. Server half: getSignedUploadUrlAction
// gates on <resource>:edit (real permissions matrix), validates size, and builds
// the same path conventions as the old client-side uploader. Client half:
// uploadViaSignedUrl PUTs with plain fetch — non-ok surfaces the status, and a
// 60s AbortController ceiling turns a hung PUT into upload_timeout instead of a
// forever-spinner.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string;
    role: string;
    status: string;
  } | null,
  signedResult: {
    data: {
      signedUrl: "https://x.supabase.co/storage/v1/object/upload/sign/attachments/p?token=tok",
      token: "tok",
      path: "p",
    } as { signedUrl: string; token: string; path: string } | null,
    error: null as { message: string } | null,
  },
  signedPaths: [] as { bucket: string; path: string }[],
  removed: [] as { bucket: string; paths: string[] }[],
  // uploadViaSignedUrl tests stub the action module-level; state lives here.
  actionResult: null as unknown,
}));

vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: (bucket: string) => ({
        createSignedUploadUrl: async (path: string) => {
          h.signedPaths.push({ bucket, path });
          return h.signedResult;
        },
        remove: async (paths: string[]) => {
          h.removed.push({ bucket, paths });
          return { data: null, error: null };
        },
      }),
    },
  }),
}));

import {
  getSignedUploadUrlAction,
  deleteUploadedObjectAction,
} from "@/app/(app)/attachments/actions";

const BASE_INPUT = {
  entityType: "product",
  entityId: "prod-1",
  filename: "data sheet.pdf",
  contentType: "application/pdf",
  sizeBytes: 1234,
};

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  h.signedResult = {
    data: {
      signedUrl:
        "https://x.supabase.co/storage/v1/object/upload/sign/attachments/p?token=tok",
      token: "tok",
      path: "p",
    },
    error: null,
  };
  h.signedPaths = [];
  h.removed = [];
});

describe("getSignedUploadUrlAction", () => {
  it("SUCCEEDS for an inventory editor (ProjectManager) on a product", async () => {
    h.profile = { id: "u1", role: "ProjectManager", status: "Active" };
    const res = await getSignedUploadUrlAction(BASE_INPUT);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.bucket).toBe("attachments");
      expect(res.token).toBe("tok");
      expect(res.signedUrl).toContain("token=");
    }
  });

  it("is FORBIDDEN without <resource>:edit (Technician — inventory:view only)", async () => {
    h.profile = { id: "u1", role: "Technician", status: "Active" };
    const res = await getSignedUploadUrlAction(BASE_INPUT);
    expect(res.ok).toBe(false);
    expect(h.signedPaths).toHaveLength(0); // never reached the service role
  });

  it("rejects sizeBytes > 50MB", async () => {
    const res = await getSignedUploadUrlAction({
      ...BASE_INPUT,
      sizeBytes: 50 * 1024 * 1024 + 1,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/too large/i);
    expect(h.signedPaths).toHaveLength(0);
  });

  it("builds the {entityType}/{entityId}/{ts}-{safeName} path in the attachments bucket", async () => {
    const res = await getSignedUploadUrlAction(BASE_INPUT);
    expect(res.ok).toBe(true);
    const signed = h.signedPaths[0];
    expect(signed.bucket).toBe("attachments");
    // "data sheet.pdf" → sanitized "data_sheet.pdf", prefixed by entity + ts.
    expect(signed.path).toMatch(/^product\/prod-1\/\d+-data_sheet\.pdf$/);
    if (res.ok) expect(res.path).toBe(signed.path);
  });

  it("product_image routes to the product-images bucket with products/{id}/{ts}.jpg", async () => {
    const res = await getSignedUploadUrlAction({
      ...BASE_INPUT,
      entityType: "product_image",
      contentType: "image/jpeg",
      filename: "image.jpg",
    });
    expect(res.ok).toBe(true);
    const signed = h.signedPaths[0];
    expect(signed.bucket).toBe("product-images");
    expect(signed.path).toMatch(/^products\/prod-1\/\d+\.jpg$/);
  });

  it("surfaces a storage signing error instead of hanging", async () => {
    h.signedResult = { data: null, error: { message: "bucket not found" } };
    const res = await getSignedUploadUrlAction(BASE_INPUT);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/bucket not found/i);
  });
});

// SAFARI-FIX residual (#311) — the quote-drawings surface.
describe("getSignedUploadUrlAction — quote_drawing", () => {
  const DRAWING_INPUT = {
    entityType: "quote_drawing",
    entityId: "client-supplied-ignored",
    filename: "floor plan.pdf",
    contentType: "application/pdf",
    sizeBytes: 1234,
  };

  it("maps to the quote-drawings bucket, gated on quotes:edit (SalesRep passes)", async () => {
    // SalesRep has quotes:edit but NOT inventory:edit — success proves the
    // quote_drawing → quotes mapping (the unmapped fallback is inventory).
    h.profile = { id: "u1", role: "SalesRep", status: "Active" };
    const res = await getSignedUploadUrlAction(DRAWING_INPUT);
    expect(res.ok).toBe(true);
    const signed = h.signedPaths[0];
    expect(signed.bucket).toBe("quote-drawings");
    // Namespaced by the AUTHENTICATED user (u1) — client entityId ignored.
    expect(signed.path).toMatch(/^u1\/\d+-floor_plan\.pdf$/);
  });

  it("is FORBIDDEN without quotes:edit (Technician)", async () => {
    h.profile = { id: "u1", role: "Technician", status: "Active" };
    const res = await getSignedUploadUrlAction(DRAWING_INPUT);
    expect(res.ok).toBe(false);
    expect(h.signedPaths).toHaveLength(0);
  });

  it("rejects a non-PDF contentType", async () => {
    const res = await getSignedUploadUrlAction({
      ...DRAWING_INPUT,
      contentType: "image/png",
      filename: "plan.png",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/pdf/i);
    expect(h.signedPaths).toHaveLength(0);
  });

  it("rejects sizeBytes > 20MB (bucket constraint, below the general 50MB)", async () => {
    const res = await getSignedUploadUrlAction({
      ...DRAWING_INPUT,
      sizeBytes: 20 * 1024 * 1024 + 1,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/20 MB/);
    expect(h.signedPaths).toHaveLength(0);
  });
});

describe("deleteUploadedObjectAction", () => {
  it("removes an object under the entity's own namespace", async () => {
    const res = await deleteUploadedObjectAction({
      entityType: "product",
      entityId: "prod-1",
      path: "product/prod-1/123-x.pdf",
    });
    expect(res.ok).toBe(true);
    expect(h.removed[0]).toEqual({
      bucket: "attachments",
      paths: ["product/prod-1/123-x.pdf"],
    });
  });

  it("rejects a path outside the entity's namespace (no gate-shopping)", async () => {
    const res = await deleteUploadedObjectAction({
      entityType: "product",
      entityId: "prod-1",
      path: "quote/q-9/123-x.pdf",
    });
    expect(res.ok).toBe(false);
    expect(h.removed).toHaveLength(0);
  });

  it("quote_drawing: removes ANY user's drawing for a quotes editor", async () => {
    h.profile = { id: "u1", role: "SalesRep", status: "Active" };
    const res = await deleteUploadedObjectAction({
      entityType: "quote_drawing",
      entityId: "self",
      path: "other-user/1234-plan.pdf",
    });
    expect(res.ok).toBe(true);
    expect(h.removed[0]).toEqual({
      bucket: "quote-drawings",
      paths: ["other-user/1234-plan.pdf"],
    });
  });

  it("quote_drawing: rejects traversal and shapeless paths", async () => {
    for (const path of ["../secrets.pdf", "/abs.pdf", "noslash.pdf"]) {
      const res = await deleteUploadedObjectAction({
        entityType: "quote_drawing",
        entityId: "self",
        path,
      });
      expect(res.ok).toBe(false);
    }
    expect(h.removed).toHaveLength(0);
  });
});

// ── Client half ──────────────────────────────────────────────────────────────

describe("uploadViaSignedUrl", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    vi.useRealTimers();
  });

  async function callWith(fetchImpl: typeof fetch) {
    global.fetch = fetchImpl;
    // Fresh import per test not needed — module reads global.fetch at call time.
    const { uploadViaSignedUrl } = await import(
      "@/lib/attachments/upload-client"
    );
    return uploadViaSignedUrl({
      entityType: "product",
      entityId: "prod-1",
      file: new File(["%PDF-1.4"], "x.pdf", { type: "application/pdf" }),
    });
  }

  it("PUT non-ok → returns { ok: false } carrying the status", async () => {
    const res = await callWith(
      vi.fn(async () => ({
        ok: false,
        status: 403,
        text: async () => "row-level security",
      })) as unknown as typeof fetch
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("403");
      expect(res.error).toContain("row-level security");
    }
  });

  it("PUT ok → returns the server-computed path + bucket", async () => {
    const res = await callWith(
      vi.fn(async () => ({ ok: true, status: 200 })) as unknown as typeof fetch
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.bucket).toBe("attachments");
      expect(res.path).toMatch(/^product\/prod-1\/\d+-x\.pdf$/);
    }
  });

  it("hung PUT aborts at 60s and returns upload_timeout (never spins forever)", async () => {
    vi.useFakeTimers();
    const hangingFetch = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError"))
        );
      })) as unknown as typeof fetch;

    global.fetch = hangingFetch;
    const { uploadViaSignedUrl } = await import(
      "@/lib/attachments/upload-client"
    );
    const pending = uploadViaSignedUrl({
      entityType: "product",
      entityId: "prod-1",
      file: new File(["x"], "x.pdf", { type: "application/pdf" }),
    });
    await vi.advanceTimersByTimeAsync(60_000);
    const res = await pending;
    expect(res).toEqual({ ok: false, error: "upload_timeout" });
  });

  it("rejects a disallowed content type client-side without calling the server", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const { uploadViaSignedUrl } = await import(
      "@/lib/attachments/upload-client"
    );
    const res = await uploadViaSignedUrl({
      entityType: "product",
      entityId: "prod-1",
      file: new File(["x"], "x.exe", { type: "application/octet-stream" }),
    });
    expect(res.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
