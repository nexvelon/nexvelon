-- 0020_currency_expansion.sql
-- CL-20: expand the preferred_currency CHECK constraint on both
-- clients + sites tables to allow AED (UAE Dirham), INR (Indian
-- Rupee), and EUR (Euro) alongside the existing CAD + USD. Mirrors
-- the multi-country expansion from ADDR-1 (5 supported countries).
--
-- CAD + USD stay in the allow-list per §2.1 past-data preservation —
-- existing rows keep their values and the DB still accepts them on
-- read/write.
--
-- DROP + recreate pattern matches CL-11 (0018) for payment_method.

BEGIN;

-- ─── Clients ───
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_preferred_currency_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_preferred_currency_check
  CHECK (preferred_currency IN ('CAD','USD','AED','INR','EUR'));

-- ─── Sites ───
ALTER TABLE public.sites
  DROP CONSTRAINT IF EXISTS sites_preferred_currency_check;
ALTER TABLE public.sites
  ADD CONSTRAINT sites_preferred_currency_check
  CHECK (preferred_currency IN ('CAD','USD','AED','INR','EUR'));

COMMIT;
