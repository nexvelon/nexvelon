-- 0018_payment_method_cash.sql
-- CL-11: add 'cash' to the preferred_payment_method CHECK constraint
-- on both clients + sites tables. 'cheque' stays in the allowed set
-- per §2.1 past-data preservation — existing rows keep their values
-- and the DB still accepts 'cheque' on read/write. The form-side
-- dropdown drops Cheque for new selections (CL-11 ClientForm +
-- SiteForm) but legacy rows render as "Cheque (legacy)" via a
-- conditional-include in the dropdown options.
--
-- Postgres auto-names inline CHECK constraints
-- `<table>_<column>_check`, so the DROP CONSTRAINT IF EXISTS line
-- targets the exact name created by migrations 0007 (clients) and
-- 0015 (sites). The ADD CONSTRAINT then re-creates it with the
-- expanded allow-list including 'cash'.

BEGIN;

-- ─── Clients ───
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_preferred_payment_method_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_preferred_payment_method_check
  CHECK (preferred_payment_method IN ('cheque','eft','credit_card','e_transfer','wire','cash'));

-- ─── Sites ───
ALTER TABLE public.sites
  DROP CONSTRAINT IF EXISTS sites_preferred_payment_method_check;
ALTER TABLE public.sites
  ADD CONSTRAINT sites_preferred_payment_method_check
  CHECK (preferred_payment_method IN ('cheque','eft','credit_card','e_transfer','wire','cash'));

COMMIT;
