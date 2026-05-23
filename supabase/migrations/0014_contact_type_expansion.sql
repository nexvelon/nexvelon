-- 0014_contact_type_expansion.sql
-- CL-7: Add Accounts Payable boolean + Custom text columns to contacts.
-- No backfill needed — defaults handle existing rows.

BEGIN;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS is_accounts_payable boolean NOT NULL DEFAULT false;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS contact_type_custom text;

COMMIT;
