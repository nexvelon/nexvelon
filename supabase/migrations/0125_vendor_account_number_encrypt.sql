-- 0125_vendor_account_number_encrypt.sql
-- SEC-2 — encryption-at-rest for vendors.account_number (a stored credential).
--
-- STEP 1 of 2 (ADDITIVE, §1): add the encrypted column. The plaintext column
-- (account_number) is LEFT IN PLACE here so nothing breaks mid-transition; it is
-- emptied by the backfill script and dropped by 0126 afterwards.
--
-- The value is encrypted APPLICATION-SIDE (AES-256-GCM) with a key that lives
-- ONLY in the CREDENTIAL_ENCRYPTION_KEY environment variable — never in this
-- database, never in Supabase Vault, never in a backup. This migration therefore
-- does NOT itself encrypt anything (it has no key); the one-time transform runs
-- via scripts/backfill-vendor-credentials.ts, which holds the key.

BEGIN;

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS account_number_encrypted text;

COMMENT ON COLUMN public.vendors.account_number_encrypted IS
  'SEC-2 AES-256-GCM envelope (v1.<iv>.<tag>.<ciphertext>) of the account number. Key is application-env only (CREDENTIAL_ENCRYPTION_KEY); decrypt server-side behind a permission check. Never returned in a list/export/report/PDF.';

COMMIT;

-- No GRANT/RLS change: the new column inherits the vendors table policies (0030).
--
-- ── After applying this migration ──────────────────────────────────────────
-- Pre-flight (how many rows will the backfill transform?):
--   SELECT count(*) FROM public.vendors WHERE account_number IS NOT NULL;
-- Then run, with CREDENTIAL_ENCRYPTION_KEY + service-role key in .env.local:
--   npx tsx scripts/backfill-vendor-credentials.ts
-- Then apply 0126 to drop the plaintext column.
--
-- ── Reverse (this migration only) ──────────────────────────────────────────
--   ALTER TABLE public.vendors DROP COLUMN IF EXISTS account_number_encrypted;
-- (Safe to reverse BEFORE the backfill runs. Once 0126 has dropped the plaintext
--  column, the encrypted column is the only copy — see 0126 on reversibility.)
