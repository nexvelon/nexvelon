// SEC-2 — the pure AES-256-GCM envelope primitive. NO "server-only" guard and NO
// key resolution, so it can be shared by the server-only credentials wrapper
// (lib/crypto/credentials.ts) AND the one-time backfill script
// (scripts/backfill-vendor-credentials.ts) without either drifting from the
// other's format. The KEY is always passed in explicitly — this module never
// reads the environment.
//
// Envelope: v1.<iv b64>.<authTag b64>.<ciphertext b64>  (authenticated: a
// tampered or wrong-key payload throws on decrypt, never returns garbage).

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

export const CRED_ALGO = "aes-256-gcm";
export const CRED_IV_BYTES = 12;
export const CRED_KEY_BYTES = 32;
export const CRED_VERSION = "v1";

export class AesGcmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AesGcmError";
  }
}

/** Validate + decode a base64 key to a 32-byte Buffer. Throws on any problem. */
export function decodeKey(rawBase64: string | undefined | null): Buffer {
  if (!rawBase64) throw new AesGcmError("Encryption key is not set.");
  let key: Buffer;
  try {
    key = Buffer.from(rawBase64, "base64");
  } catch {
    throw new AesGcmError("Encryption key is not valid base64.");
  }
  if (key.length !== CRED_KEY_BYTES) {
    throw new AesGcmError(
      `Encryption key must decode to ${CRED_KEY_BYTES} bytes (got ${key.length}).`
    );
  }
  return key;
}

export function aesGcmEncrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(CRED_IV_BYTES);
  const cipher = createCipheriv(CRED_ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    CRED_VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function aesGcmDecrypt(payload: string, key: Buffer): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== CRED_VERSION) {
    throw new AesGcmError("Malformed ciphertext.");
  }
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const ciphertext = Buffer.from(parts[3], "base64");
  if (iv.length !== CRED_IV_BYTES) throw new AesGcmError("Malformed ciphertext (iv).");
  const decipher = createDecipheriv(CRED_ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** True if a stored string is one of our envelopes (not stray plaintext). */
export function looksEncrypted(value: string | null | undefined): boolean {
  return (
    typeof value === "string" &&
    value.startsWith(`${CRED_VERSION}.`) &&
    value.split(".").length === 4
  );
}
