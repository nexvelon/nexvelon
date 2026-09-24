// SEC-2 — the credential encryption primitive. Round-trips must return the exact
// original for awkward inputs (leading zeros, symbols, unicode); tampering and
// wrong keys must fail closed; a missing key must not silently pass plaintext.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// A deterministic 32-byte test key (base64). Real keys come from the env.
const KEY_A = Buffer.alloc(32, 7).toString("base64");
const KEY_B = Buffer.alloc(32, 9).toString("base64");

beforeEach(() => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = KEY_A;
  vi.resetModules();
});
afterEach(() => {
  delete process.env.CREDENTIAL_ENCRYPTION_KEY;
});

async function mod() {
  return import("@/lib/crypto/credentials");
}

const AWKWARD = [
  "000123456", // leading zeros must survive
  "12345678",
  "acct-#7788/99", // symbols
  "café résumé", // accents
  "код-🔐-secret", // unicode + emoji
  "   spaces   ",
  "a", // single char
  "x".repeat(500), // long
];

describe("SEC-2 credential crypto", () => {
  it("round-trips every awkward value to the EXACT original", async () => {
    const { encryptCredential, decryptCredential } = await mod();
    for (const original of AWKWARD) {
      const ct = encryptCredential(original);
      expect(ct).not.toBe(original); // actually encrypted
      expect(ct.startsWith("v1.")).toBe(true);
      expect(decryptCredential(ct)).toBe(original);
    }
  });

  it("produces a different ciphertext each time (random IV) but same plaintext", async () => {
    const { encryptCredential, decryptCredential } = await mod();
    const a = encryptCredential("000123456");
    const b = encryptCredential("000123456");
    expect(a).not.toBe(b);
    expect(decryptCredential(a)).toBe("000123456");
    expect(decryptCredential(b)).toBe("000123456");
  });

  it("decrypt FAILS CLOSED on tampering (GCM auth tag)", async () => {
    const { encryptCredential, decryptCredential } = await mod();
    const ct = encryptCredential("000123456");
    const parts = ct.split(".");
    // Flip a byte in the ciphertext segment.
    const buf = Buffer.from(parts[3], "base64");
    buf[0] = buf[0] ^ 0xff;
    const tampered = [parts[0], parts[1], parts[2], buf.toString("base64")].join(".");
    expect(() => decryptCredential(tampered)).toThrow();
  });

  it("decrypt FAILS CLOSED with the wrong key (never returns plaintext)", async () => {
    const { encryptCredential } = await mod();
    const ct = encryptCredential("000123456");
    process.env.CREDENTIAL_ENCRYPTION_KEY = KEY_B;
    vi.resetModules();
    const { decryptCredential } = await mod();
    expect(() => decryptCredential(ct)).toThrow();
  });

  it("throws (never passes plaintext) when the key is missing — fail closed", async () => {
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    vi.resetModules();
    const { encryptCredential, decryptCredential, isEncryptionConfigured } = await mod();
    expect(isEncryptionConfigured()).toBe(false);
    expect(() => encryptCredential("x")).toThrow();
    expect(() => decryptCredential("v1.a.b.c")).toThrow();
  });

  it("rejects a malformed envelope", async () => {
    const { decryptCredential } = await mod();
    expect(() => decryptCredential("not-an-envelope")).toThrow();
    expect(() => decryptCredential("v9.a.b.c")).toThrow();
  });

  it("looksEncrypted distinguishes envelopes from stray plaintext", async () => {
    const { encryptCredential, looksEncrypted } = await mod();
    expect(looksEncrypted(encryptCredential("000123456"))).toBe(true);
    expect(looksEncrypted("000123456")).toBe(false);
    expect(looksEncrypted(null)).toBe(false);
    expect(looksEncrypted("")).toBe(false);
  });

  it("isEncryptionConfigured is false for a wrong-length key", async () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64");
    vi.resetModules();
    const { isEncryptionConfigured } = await mod();
    expect(isEncryptionConfigured()).toBe(false);
  });
});
