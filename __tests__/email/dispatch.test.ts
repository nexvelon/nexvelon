// MAIL-1 — the central email dispatcher's guarantees:
//   • client-facing mail sends FROM one authenticated address with the rep as the
//     display name and reply-to, and ALWAYS BCCs the standing copy address;
//   • the BCC on client mail cannot be omitted;
//   • internal mail keeps its transport from and is never BCC'd to the copy addr;
//   • a plain-text alternative is required and links must be absolute;
//   • every send (success OR failure) writes an email_log row, and a provider
//     failure is returned (ok:false) rather than thrown.

import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  resendSend: vi.fn(async () => ({ data: { id: "email_abc" }, error: null as { message: string } | null })),
  logInsert: vi.fn(async () => ({ error: null })),
}));

vi.mock("resend", () => ({
  Resend: vi.fn(() => ({ emails: { send: h.resendSend } })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ insert: h.logInsert }) }),
}));

import {
  dispatchEmail,
  clientDisplayName,
  resolveFrom,
  resolveBcc,
  assertMessageHygiene,
  CLIENT_FROM_EMAIL,
  CLIENT_BCC,
  INTERNAL_FROM,
} from "@/lib/email/dispatch";

const baseHtml = `<p>Hello</p><a href="https://app.nexvelonglobal.com/q/abc">Open</a>`;
const baseText = "Hello — https://app.nexvelonglobal.com/q/abc";

beforeEach(() => {
  process.env.RESEND_API_KEY = "test_key";
  h.resendSend.mockClear();
  h.resendSend.mockResolvedValue({ data: { id: "email_abc" }, error: null });
  h.logInsert.mockClear();
});

// ── the central path cannot be bypassed ──────────────────────────────────────
describe("single send path", () => {
  it("no email builder calls resend.emails.send directly — all route through dispatchEmail", () => {
    const src = readFileSync(join(process.cwd(), "lib/auth/email.ts"), "utf8");
    expect(src).not.toMatch(/\.emails\.send\s*\(/);
    expect(src).toMatch(/dispatchEmail\(/);
  });
});

// ── pure identity helpers ────────────────────────────────────────────────────
describe("identity composition", () => {
  it("client display name is '<Rep> via Nexvelon', or just the org without a rep", () => {
    expect(clientDisplayName({ name: "Jay Shah" })).toBe("Jay Shah via Nexvelon");
    expect(clientDisplayName(null)).toBe("Nexvelon");
    expect(clientDisplayName({ name: "  " })).toBe("Nexvelon");
  });

  it("client mail always sends from the single authenticated address", () => {
    expect(resolveFrom({ kind: "client", sender: { name: "Jay Shah" } })).toBe(
      `Jay Shah via Nexvelon <${CLIENT_FROM_EMAIL}>`
    );
  });

  it("internal mail uses its fromOverride, else the transport default", () => {
    expect(resolveFrom({ kind: "internal", fromOverride: "Nexvelon <noreply@nexvelonglobal.com>" })).toBe(
      "Nexvelon <noreply@nexvelonglobal.com>"
    );
    expect(resolveFrom({ kind: "internal" })).toBe(INTERNAL_FROM);
  });

  it("client BCC always includes the copy address and cannot be dropped", () => {
    expect(resolveBcc({ kind: "client" })).toContain(CLIENT_BCC);
    // even an empty extra bcc still carries the standing copy
    expect(resolveBcc({ kind: "client", bcc: [] })).toEqual([CLIENT_BCC]);
    // extras are merged + de-duped, copy address still present
    const merged = resolveBcc({ kind: "client", bcc: ["extra@x.com", CLIENT_BCC] });
    expect(merged).toContain(CLIENT_BCC);
    expect(merged).toContain("extra@x.com");
    expect(merged.filter((a) => a === CLIENT_BCC)).toHaveLength(1);
  });

  it("internal mail is NOT bcc'd to the client copy address", () => {
    expect(resolveBcc({ kind: "internal" })).toEqual([]);
    expect(resolveBcc({ kind: "internal" })).not.toContain(CLIENT_BCC);
  });
});

// ── message hygiene ──────────────────────────────────────────────────────────
describe("assertMessageHygiene", () => {
  it("requires a plain-text alternative", () => {
    expect(() => assertMessageHygiene({ label: "x", html: baseHtml, text: "" })).toThrow(/plain-text/);
  });
  it("rejects root-relative links", () => {
    expect(() =>
      assertMessageHygiene({ label: "x", html: `<a href="/q/abc">x</a>`, text: baseText })
    ).toThrow(/absolute/);
  });
  it("rejects link shorteners", () => {
    expect(() =>
      assertMessageHygiene({ label: "x", html: `<a href="https://bit.ly/xyz">x</a>`, text: baseText })
    ).toThrow(/shortener/);
  });
  it("accepts absolute URLs on the real domain", () => {
    expect(() => assertMessageHygiene({ label: "x", html: baseHtml, text: baseText })).not.toThrow();
  });
});

// ── dispatch behavior ────────────────────────────────────────────────────────
describe("dispatchEmail", () => {
  it("client send sets from/reply-to/bcc from the rep + copy address, and logs 'sent'", async () => {
    const res = await dispatchEmail({
      label: "sendQuotePortalEmail",
      kind: "client",
      sender: { name: "Jay Shah", email: "jay@nexvelonglobal.com" },
      to: "client@acme.com",
      subject: "Your quote",
      html: baseHtml,
      text: baseText,
      log: { entityType: "quote", entityId: "q1", sentBy: "u1" },
    });
    expect(res).toEqual({ ok: true, id: "email_abc", error: null });
    const arg = h.resendSend.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.from).toBe(`Jay Shah via Nexvelon <${CLIENT_FROM_EMAIL}>`);
    expect(arg.replyTo).toBe("jay@nexvelonglobal.com");
    expect(arg.bcc).toContain(CLIENT_BCC);
    // logged as sent, with identity + entity context
    const logged = h.logInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(logged).toMatchObject({
      kind: "client",
      to_email: "client@acme.com",
      status: "sent",
      provider_message_id: "email_abc",
      entity_type: "quote",
      entity_id: "q1",
      sent_by: "u1",
    });
  });

  it("a client send with no rep still BCCs the copy address (cannot be bypassed)", async () => {
    await dispatchEmail({
      label: "x", kind: "client", to: "c@x.com", subject: "s", html: baseHtml, text: baseText,
    });
    const arg = h.resendSend.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.bcc).toContain(CLIENT_BCC);
  });

  it("internal send has no client BCC and no reply-to", async () => {
    await dispatchEmail({
      label: "sendOtpEmail", kind: "internal", fromOverride: INTERNAL_FROM,
      to: "u@x.com", subject: "code", html: baseHtml, text: baseText,
    });
    const arg = h.resendSend.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.from).toBe(INTERNAL_FROM);
    expect(arg.bcc).toBeUndefined();
    expect(arg.replyTo).toBeUndefined();
  });

  it("a provider failure is recorded ('failed') and returned, not thrown", async () => {
    h.resendSend.mockResolvedValueOnce({ data: null as never, error: { message: "domain not verified" } });
    const res = await dispatchEmail({
      label: "x", kind: "client", to: "c@x.com", subject: "s", html: baseHtml, text: baseText,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("domain not verified");
    const logged = h.logInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(logged).toMatchObject({ status: "failed", error: "domain not verified", provider_message_id: null });
  });

  it("a thrown transport error is caught, recorded, and returned as ok:false", async () => {
    h.resendSend.mockRejectedValueOnce(new Error("network down"));
    const res = await dispatchEmail({
      label: "x", kind: "client", to: "c@x.com", subject: "s", html: baseHtml, text: baseText,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("network down");
    expect((h.logInsert.mock.calls[0][0] as Record<string, unknown>).status).toBe("failed");
  });

  it("refuses to send without a plain-text part (hygiene enforced pre-send)", async () => {
    await expect(
      dispatchEmail({ label: "x", kind: "client", to: "c@x.com", subject: "s", html: baseHtml, text: "" })
    ).rejects.toThrow(/plain-text/);
    expect(h.resendSend).not.toHaveBeenCalled();
  });
});
