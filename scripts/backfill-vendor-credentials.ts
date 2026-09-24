/**
 * scripts/backfill-vendor-credentials.ts
 * ---------------------------------------------------------------------------
 * SEC-2 — one-time transform: encrypt every existing vendors.account_number in
 * place (AES-256-GCM), VERIFY the round-trip, then clear the plaintext. Runs
 * APPLICATION-SIDE because the key lives only in the environment, never in the
 * database (see lib/crypto/credentials.ts for the key-custody rationale).
 *
 *   npx tsx scripts/backfill-vendor-credentials.ts            # do it
 *   npx tsx scripts/backfill-vendor-credentials.ts --dry-run  # report only
 *
 * Requires in .env.local (or the environment):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CREDENTIAL_ENCRYPTION_KEY   (32 bytes, base64 — the SAME value the app runs with)
 *
 * Per row (idempotent — skips rows already encrypted):
 *   1. read plaintext account_number
 *   2. encrypt → account_number_encrypted
 *   3. VERIFY: decrypt(account_number_encrypted) === plaintext  (constant-time)
 *   4. only if verify passes: clear plaintext (account_number = NULL)
 *
 * If step 3 fails for a row, that row is left UNTOUCHED (plaintext kept, no
 * cleared value) and counted as a failure — a botched transform never destroys a
 * value it could not prove it can recover. If the process dies half-way, re-run:
 * already-encrypted rows are skipped, partially-done rows finish.
 * Migration 0126 (drop plaintext) refuses to run while any failure remains.
 * ---------------------------------------------------------------------------
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { timingSafeEqual } from "node:crypto";
import {
  aesGcmEncrypt,
  aesGcmDecrypt,
  decodeKey,
  looksEncrypted,
} from "../lib/crypto/aes-gcm";

function loadEnv(): { url: string; serviceKey: string; cryptoKey: string } {
  const map: Record<string, string> = { ...(process.env as Record<string, string>) };
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (map[k] === undefined) map[k] = v;
    }
  } catch {
    // .env.local optional if the vars are already in the environment.
  }
  const url = map.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = map.SUPABASE_SERVICE_ROLE_KEY;
  const cryptoKey = map.CREDENTIAL_ENCRYPTION_KEY;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  if (!serviceKey || serviceKey === "PASTE_SECRET_KEY_HERE")
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  if (!cryptoKey) throw new Error("Missing CREDENTIAL_ENCRYPTION_KEY.");
  // Validate the key up front — better to fail before touching any row.
  decodeKey(cryptoKey);
  return { url, serviceKey, cryptoKey };
}

function eq(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { url, serviceKey, cryptoKey } = loadEnv();
  const key = decodeKey(cryptoKey);
  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await sb
    .from("vendors")
    .select("id, name, account_number, account_number_encrypted");
  if (error) throw new Error(`read vendors: ${error.message}`);
  const rows = (data ?? []) as Array<{
    id: string;
    name: string;
    account_number: string | null;
    account_number_encrypted: string | null;
  }>;

  const candidates = rows.filter(
    (r) => r.account_number != null && r.account_number !== "" && !r.account_number_encrypted
  );
  const alreadyEncrypted = rows.filter((r) => looksEncrypted(r.account_number_encrypted));

  console.log(
    `\n  SEC-2 vendor credential backfill${dryRun ? " (DRY RUN)" : ""}\n` +
      `  ────────────────────────────────────────\n` +
      `  vendors total          : ${rows.length}\n` +
      `  already encrypted      : ${alreadyEncrypted.length}\n` +
      `  to encrypt this run    : ${candidates.length}\n`
  );

  let ok = 0;
  let failed = 0;
  for (const r of candidates) {
    const plaintext = r.account_number as string;
    const envelope = aesGcmEncrypt(plaintext, key);
    // VERIFY before writing anything: prove we can recover the exact value.
    let roundTrip: string;
    try {
      roundTrip = aesGcmDecrypt(envelope, key);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${r.name} (${r.id}): decrypt-verify threw — left untouched.`, e);
      continue;
    }
    if (!eq(roundTrip, plaintext)) {
      failed++;
      console.error(`  ✗ ${r.name} (${r.id}): round-trip mismatch — left untouched.`);
      continue;
    }
    if (dryRun) {
      ok++;
      continue;
    }
    // Write ciphertext AND clear plaintext together.
    const { error: upErr } = await sb
      .from("vendors")
      .update({ account_number_encrypted: envelope, account_number: null })
      .eq("id", r.id);
    if (upErr) {
      failed++;
      console.error(`  ✗ ${r.name} (${r.id}): update failed — ${upErr.message}`);
      continue;
    }
    ok++;
  }

  // Post-run verification: how much un-encrypted plaintext remains?
  const { data: after } = await sb
    .from("vendors")
    .select("id")
    .not("account_number", "is", null)
    .is("account_number_encrypted", null);
  const remaining = (after ?? []).length;

  console.log(
    `\n  ${dryRun ? "would encrypt" : "encrypted"} : ${ok}\n` +
      `  failed        : ${failed}\n` +
      `  remaining plaintext (un-encrypted): ${remaining}\n`
  );
  if (!dryRun && remaining === 0 && failed === 0) {
    console.log("  ✓ All vendor account numbers are encrypted. Safe to apply 0126.\n");
  } else if (!dryRun) {
    console.log("  ⚠ Do NOT apply 0126 yet — resolve failures / re-run first.\n");
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\nbackfill-vendor-credentials failed:");
  console.error("  " + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
