-- 0126_vendor_account_number_drop_plaintext.sql
-- SEC-2 — STEP 2 of 2. DESTRUCTIVE + IRREVERSIBLE.
--
-- ⚠️  DO NOT RUN THIS until scripts/backfill-vendor-credentials.ts has reported
--     "remaining plaintext: 0". This drops the plaintext account_number column.
--     After it runs, the AES-256-GCM ciphertext is the ONLY copy of the value —
--     if CREDENTIAL_ENCRYPTION_KEY is ever lost, the values are unrecoverable.
--     There is NO reverse migration: dropping a column deletes its data.
--
-- The DO block refuses to run if ANY row still holds un-encrypted plaintext, so a
-- half-finished backfill cannot silently destroy data.

BEGIN;

DO $$
DECLARE
  remaining int;
BEGIN
  SELECT count(*) INTO remaining
  FROM public.vendors
  WHERE account_number IS NOT NULL
    AND account_number_encrypted IS NULL;
  IF remaining > 0 THEN
    RAISE EXCEPTION
      'Refusing to drop account_number: % vendor row(s) still hold un-encrypted plaintext. Run scripts/backfill-vendor-credentials.ts first.',
      remaining;
  END IF;
END $$;

ALTER TABLE public.vendors DROP COLUMN IF EXISTS account_number;

COMMIT;

-- Verification (must return 0 rows — the column is gone):
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='vendors'
--      AND column_name='account_number';
--
-- Reverse: NOT POSSIBLE. The plaintext is deleted. (You could re-add an empty
--  account_number column, but the original values cannot be recovered from the
--  ciphertext without CREDENTIAL_ENCRYPTION_KEY, and even then only by decrypting
--  application-side.)
