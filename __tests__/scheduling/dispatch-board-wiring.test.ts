// SCHED-2 — the drag handler surfaces the booking API's typed rejections as
// user-facing messages (cert_block / tech_double_booked / invalid_window), and
// success produces no error message. Pure helper — no rendering.

import { describe, it, expect } from "vitest";
import { bookingErrorMessage } from "@/lib/scheduling/board-slots";
import type { BookingResult } from "@/lib/api/schedule-assignments";

describe("bookingErrorMessage", () => {
  it("returns null on success (nothing to surface)", () => {
    const ok: BookingResult = { ok: true, booking: {} as never };
    expect(bookingErrorMessage(ok, "Ana")).toBeNull();
  });

  it("names the missing cert on a cert_block", () => {
    const r: BookingResult = { ok: false, error: "cert_block", reasons: ["Missing Kantech certification."] };
    const msg = bookingErrorMessage(r, "Ana");
    expect(msg).toMatch(/Ana/);
    expect(msg).toMatch(/Missing Kantech/);
  });

  it("reports the conflicting window on a double-book", () => {
    const r: BookingResult = {
      ok: false,
      error: "tech_double_booked",
      conflict: { starts_at: "2026-08-01T09:00:00.000Z", ends_at: "2026-08-01T12:00:00.000Z" },
    };
    const msg = bookingErrorMessage(r, "Ben")!;
    expect(msg).toMatch(/Ben/);
    expect(msg).toMatch(/already booked/i);
  });

  it("handles invalid_window and not_found", () => {
    expect(bookingErrorMessage({ ok: false, error: "invalid_window" }, "Ana")).toMatch(/Invalid/i);
    expect(bookingErrorMessage({ ok: false, error: "not_found" }, "Ana")).toMatch(/not found/i);
  });
});
