import "server-only";

// SEC-2 — application-layer encryption for stored credentials (REALITY-1 §4.2
// dimension 6: encryption-at-rest was ABSENT). Thin server-only wrapper over the
// pure AES-256-GCM envelope in ./aes-gcm — this file adds env-key resolution and
// the "server-only" guard so the key is never bundled to the client.
//
// KEY CUSTODY (the consequential decision): the key lives ONLY in the
// CREDENTIAL_ENCRYPTION_KEY environment variable of the server runtime. It is
// NEVER written to Postgres — not to a table, not to Supabase Vault (which lives
// in the database and therefore travels inside every logical backup), and it is
// never sent to the database as a query parameter. A database dump therefore
// contains ciphertext and no key: decryption is impossible from a backup alone.
// A key stored beside the data it protects is theatre — this avoids that.
//
// Rotation: re-encrypt with a new key via a server-side re-key pass (decrypt with
// the old, encrypt with the new). Key loss = ciphertext unrecoverable by design,
// so the key must be backed up OUT OF BAND (a secrets manager), separate from the
// database backups.
//
// Who can decrypt: only server code that (a) runs with the env key and (b) has
// passed a permission check before calling decryptCredential. Never in bulk,
// never inside a list/export/report/PDF payload — only a single-record reveal.

import { timingSafeEqual } from "crypto";
import {
  aesGcmEncrypt,
  aesGcmDecrypt,
  decodeKey,
  looksEncrypted as looksEncryptedCore,
  AesGcmError,
} from "./aes-gcm";

export class CredentialCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialCryptoError";
  }
}

/** Resolve + validate the key from the environment. Throws (fail-closed) when
 *  unset/malformed — callers must treat a throw as "show masked", never plaintext. */
function getKey() {
  try {
    return decodeKey(process.env.CREDENTIAL_ENCRYPTION_KEY);
  } catch (e) {
    throw new CredentialCryptoError(
      e instanceof AesGcmError
        ? `CREDENTIAL_ENCRYPTION_KEY: ${e.message}`
        : "CREDENTIAL_ENCRYPTION_KEY is unusable."
    );
  }
}

/** True when a valid key is configured. Lets callers degrade to masked-state +
 *  a clear error instead of throwing on every render. Never leaks the key. */
export function isEncryptionConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

/** Encrypt a plaintext credential into the versioned envelope. */
export function encryptCredential(plaintext: string): string {
  return aesGcmEncrypt(plaintext, getKey());
}

/** Decrypt an envelope to the exact original. Throws on malformed input, a wrong
 *  key, or tampering (GCM auth-tag mismatch) — fail-closed. */
export function decryptCredential(payload: string): string {
  return aesGcmDecrypt(payload, getKey());
}

/** True if a stored string is one of our envelopes (not stray plaintext). */
export function looksEncrypted(value: string | null | undefined): boolean {
  return looksEncryptedCore(value);
}

/** The masked display for a credential that exists but must not be shown.
 *  §2.8 — a set-but-hidden field reads as "••••", never as blank. */
export const CREDENTIAL_MASK = "••••••••";

/** Constant-time compare for verify steps (backfill round-trip check). */
export function credentialsEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
