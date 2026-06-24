BEGIN;

-- POLISH-55 — Mailing gets a SECOND inheritance source. On sites, mailing can be
-- "same as Billing" (existing flag mailing_same_as_billing, 0015) OR "same as
-- Site Address" (this new flag). Parallel to clients.mailing_same_as_company
-- (added in 0072). Nullable-free boolean, default false (no backfill needed —
-- existing sites already store resolved mailing values).

ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS mailing_same_as_site boolean NOT NULL DEFAULT false;

COMMIT;
