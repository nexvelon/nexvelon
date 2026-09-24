-- 0127_invoice_holdback_hst_treatment.sql
-- FIN-TAX-1 — make the holdback HST treatment explicit + per-invoice (§2.2).
--
-- ADDITIVE, non-destructive (§1). Adds a nullable snapshot column recording which
-- HST treatment an invoice was computed under. NULL = legacy, read as the default
-- ('charged_upfront' — exactly what the system did before this migration), so
-- applying this changes NO existing figure. New invoices stamp the org's current
-- setting (company_settings key 'holdback_hst_treatment') at creation; changing
-- that setting later affects only future invoices, never an issued one.
--
-- The org-level default itself lives in the existing company_settings KV (no new
-- table) and is written by the Admin settings action — no migration needed for it.

BEGIN;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS holdback_hst_treatment text
  CHECK (
    holdback_hst_treatment IS NULL
    OR holdback_hst_treatment IN ('charged_upfront', 'deferred_to_release')
  );

COMMENT ON COLUMN public.invoices.holdback_hst_treatment IS
  'FIN-TAX-1 snapshot of the Ontario-holdback HST treatment this invoice was computed under. NULL = legacy = charged_upfront (HST on full value at invoicing, tax-exempt release). deferred_to_release = HST on payable portion now, holdback HST at release. Frozen at issue (§2.2).';

COMMIT;

-- No GRANT/RLS change: the new column inherits the invoices table policies (0043).
--
-- Existence check (after applying):
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='invoices'
--      AND column_name='holdback_hst_treatment';
--
-- Reverse:
--   ALTER TABLE public.invoices DROP COLUMN IF EXISTS holdback_hst_treatment;
-- Safe to reverse: the column is a treatment LABEL, not a tax figure — dropping it
-- makes every invoice read as the default again (its stored tax_amount is
-- untouched, so no tax figure changes).
