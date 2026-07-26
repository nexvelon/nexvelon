// INV-9-3 — the pickup-slip read actions gate on inventory:view (the base
// permission every inventory-facing role has; Subcontractor lacks it).

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
}));

vi.mock("@/lib/api/pickup-slips", () => ({
  listPickupSlipsForProduct: vi.fn(async () => [
    { id: "slip1", reference: "PS-2026-0001", recipient_type: "truck", recipient_label: "Truck 1", created_at: "2026-05-01T00:00:00Z", is_signed: true, has_pdf: true, line_count: 2 },
  ]),
  getPickupSlipPdfUrl: vi.fn(async () => "https://signed/slip1/ps.pdf"),
  // other exports imported by the actions module (unused here)
  createPickupSlip: vi.fn(),
  buildPickupSlipPdfProps: vi.fn(),
  attachSignatureToPickupSlip: vi.fn(),
  setPickupSlipPdfPath: vi.fn(),
}));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  listPickupSlipsForProductAction,
  getPickupSlipPdfUrlAction,
} from "@/app/(app)/inventory/actions";

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
});

describe("pickup-slip read actions gate (inventory:view)", () => {
  it("Technician can list slips + fetch a PDF url", async () => {
    h.profile = { id: "u1", role: "Technician", status: "Active" };
    const list = await listPickupSlipsForProductAction("pA");
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.data).toHaveLength(1);
    const url = await getPickupSlipPdfUrlAction("slip1");
    expect(url.ok).toBe(true);
    if (url.ok) expect(url.data.url).toBe("https://signed/slip1/ps.pdf");
  });

  it("Subcontractor (no inventory:view) is denied both", async () => {
    h.profile = { id: "u1", role: "Subcontractor", status: "Active" };
    expect((await listPickupSlipsForProductAction("pA")).ok).toBe(false);
    expect((await getPickupSlipPdfUrlAction("slip1")).ok).toBe(false);
  });

  it("unauthenticated is denied", async () => {
    h.profile = null;
    expect((await listPickupSlipsForProductAction("pA")).ok).toBe(false);
  });
});
