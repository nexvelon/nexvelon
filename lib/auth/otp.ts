import "server-only";

import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DbAuthOtp } from "@/lib/types/database";

// ============================================================================
// Email-OTP utilities (the second factor of our auth flow).
//
// Storage:  public.auth_otp (RLS denies all client-side access; service-role
//           is the only writer).
// Lifetime: 10 minutes.
// Length:   6 digits, generated with crypto.randomInt for uniform entropy.
// Hashing:  bcrypt, cost 10. Even though codes are short and would crack
//           quickly under a leak, bcrypt makes leak-then-replay attacks
//           materially slower than plaintext or fast-hash storage.
// Attempts: max 5 verifications per row before invalidation.
// ============================================================================

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
const BCRYPT_COST = 10;

/** Generate a fresh 6-digit numeric code, zero-padded. */
export function generateOtpCode(): string {
  // randomInt is uniform on [0, 1_000_000)
  const n = randomInt(0, 1_000_000);
  return String(n).padStart(6, "0");
}

export async function hashOtpCode(code: string): Promise<string> {
  return bcrypt.hash(code, BCRYPT_COST);
}

export async function compareOtpCode(
  code: string,
  hash: string
): Promise<boolean> {
  // bcrypt.compare is constant-time on the hash side; it's the only function
  // we need for verification.
  return bcrypt.compare(code, hash);
}

/**
 * Marks any unconsumed OTPs for the user as consumed. Call this BEFORE
 * inserting a new one so only the latest is ever live.
 */
async function invalidatePriorOtps(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("auth_otp")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("used_at", null);
  if (error) {
    throw new Error(`invalidatePriorOtps: ${error.message}`);
  }
}

/**
 * Creates a new OTP row, invalidating any prior unconsumed ones. Returns the
 * plaintext code (which the caller emails to the user) and the row id.
 *
 * Plaintext is never persisted — only its bcrypt hash.
 */
export async function createOtpForUser(userId: string): Promise<{
  id: string;
  code: string;
  expiresAt: string;
}> {
  await invalidatePriorOtps(userId);

  const code = generateOtpCode();
  const code_hash = await hashOtpCode(code);
  const expires_at = new Date(
    Date.now() + OTP_TTL_MINUTES * 60_000
  ).toISOString();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("auth_otp")
    .insert({
      user_id: userId,
      code_hash,
      expires_at,
      attempts: 0,
    })
    .select("id, expires_at")
    .single();

  if (error || !data) {
    throw new Error(`createOtpForUser: ${error?.message ?? "no row"}`);
  }
  return { id: data.id, code, expiresAt: data.expires_at };
}

/**
 * Returns the latest unconsumed OTP for the user, regardless of expiry —
 * the caller decides whether expiry should reject.
 */
export async function getActiveOtpForUser(
  userId: string
): Promise<DbAuthOtp | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("auth_otp")
    .select("*")
    .eq("user_id", userId)
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getActiveOtpForUser: ${error.message}`);
  return (data as DbAuthOtp | null) ?? null;
}

export type OtpVerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "no_pending_otp"
        | "expired"
        | "too_many_attempts"
        | "invalid_code";
      attemptsRemaining?: number;
    };

/**
 * Verifies a 6-digit code against the user's latest unconsumed OTP row.
 *
 * Side effects on every call:
 *   - on success: row.used_at = now()
 *   - on bad code: row.attempts += 1; if it hits OTP_MAX_ATTEMPTS, row is
 *     also marked used so the user must request a fresh code.
 *   - on expiry / no-row: no row mutation, just an error.
 */
export async function verifyOtpForUser(
  userId: string,
  code: string
): Promise<OtpVerifyResult> {
  const row = await getActiveOtpForUser(userId);
  if (!row) return { ok: false, reason: "no_pending_otp" };

  if (new Date(row.expires_at) <= new Date()) {
    return { ok: false, reason: "expired" };
  }

  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: "too_many_attempts" };
  }

  const admin = createAdminClient();

  const matches = await compareOtpCode(code, row.code_hash);
  if (!matches) {
    const nextAttempts = row.attempts + 1;
    const burnRow = nextAttempts >= OTP_MAX_ATTEMPTS;
    const { error } = await admin
      .from("auth_otp")
      .update({
        attempts: nextAttempts,
        used_at: burnRow ? new Date().toISOString() : null,
      })
      .eq("id", row.id);
    if (error) {
      // Swallow — verification result is more important than the bookkeeping.
      console.error("[otp] failed to record attempt:", error.message);
    }
    return {
      ok: false,
      reason: burnRow ? "too_many_attempts" : "invalid_code",
      attemptsRemaining: Math.max(0, OTP_MAX_ATTEMPTS - nextAttempts),
    };
  }

  // Success — burn the row.
  const { error: useErr } = await admin
    .from("auth_otp")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id);
  if (useErr) {
    // Don't fail the user-visible flow — but log it; this would be visible
    // as a duplicate-use attempt later.
    console.error("[otp] failed to mark used:", useErr.message);
  }
  return { ok: true };
}

/**
 * Whether the user has any active (unconsumed, unexpired) OTP — used
 * exclusively by the /auth/verify-otp page's server-side guard. Middleware
 * uses the SQL helper has_pending_otp() instead so it doesn't need
 * service-role access.
 */
export async function hasPendingOtp(userId: string): Promise<boolean> {
  const row = await getActiveOtpForUser(userId);
  if (!row) return false;
  return new Date(row.expires_at) > new Date();
}

/**
 * For "Resend code": only allow once every 60 seconds to thwart spam.
 * Uses the most recent created_at across both consumed and unconsumed rows.
 */
export async function canResendOtp(userId: string): Promise<{
  ok: boolean;
  retryAfterSeconds?: number;
}> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("auth_otp")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`canResendOtp: ${error.message}`);
  if (!data) return { ok: true };

  const lastMs = new Date(data.created_at).getTime();
  const elapsed = (Date.now() - lastMs) / 1000;
  if (elapsed < 60) {
    return { ok: false, retryAfterSeconds: Math.ceil(60 - elapsed) };
  }
  return { ok: true };
}
