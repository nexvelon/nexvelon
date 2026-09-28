-- 0133_quote_acceptance_attestation.sql
-- QUOTE-PORTAL-3 item 1 — store the mandatory acceptance attestation on the
-- record: the EXACT wording the signer was shown and agreed to. The wording may
-- change over time (it interpolates the client name), so an old acceptance must
-- keep proving what THAT signer agreed to — hence the full text is stored, not a
-- boolean. NULL for declines and for legacy (pre-0133) acceptances.
--
-- Additive: a nullable column. quote_acceptances is append-only-except-delete
-- (0131 trigger forbids UPDATE, allows DELETE) — an ALTER TABLE ADD COLUMN is DDL
-- and is unaffected by the row trigger.

BEGIN;

ALTER TABLE public.quote_acceptances
  ADD COLUMN IF NOT EXISTS attestation_text text;

COMMIT;

-- ── Existence check (after applying) ─────────────────────────────────────────
--   SELECT column_name FROM information_schema.columns WHERE table_schema='public'
--     AND table_name='quote_acceptances' AND column_name='attestation_text';   -- 1
--
-- ── Reverse migration (commented) ────────────────────────────────────────────
--   BEGIN; ALTER TABLE public.quote_acceptances DROP COLUMN IF EXISTS attestation_text; COMMIT;
