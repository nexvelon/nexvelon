-- 0019_normalize_country_values.sql
-- ADDR-1: defensive normalization for the country columns on both
-- clients + sites tables. Coerces known variants to the canonical
-- enum values (Canada / USA / UAE / India / Ireland).
--
-- Idempotent — a no-op when data is already clean. NO new CHECK
-- constraint is added (form layer enforces via TypeScript Country
-- union + dropdown; schema flexibility preserved for future country
-- additions).
--
-- Existing NULL / "" values are left as-is (NOT coerced to "Canada").
-- Unknown values that don't match any LOWER(TRIM(...)) IN (...) list
-- below also stay as-is (operator-side cleanup if needed).
--
-- Schema reality (confirmed v2 of this file):
--   * clients table has billing_country + mailing_country only — no
--     top-level country column (never existed). 0007 added the
--     billing_country column; 0012 added mailing_country.
--   * sites table has top-level country (NOT NULL DEFAULT 'Canada'
--     from 0001) + billing_country + mailing_country (SITES-2a / 0015).
--
-- So 5 column blocks total (2 on clients + 3 on sites), not 6.

BEGIN;

-- ─── clients.billing_country / mailing_country ────────────────────────
-- (NO top-level clients.country column — never existed on this table)

UPDATE public.clients SET billing_country = 'Canada'
  WHERE LOWER(TRIM(billing_country)) IN ('canada','ca','can');
UPDATE public.clients SET billing_country = 'USA'
  WHERE LOWER(TRIM(billing_country)) IN ('united states','us','usa','united states of america');
UPDATE public.clients SET billing_country = 'UAE'
  WHERE LOWER(TRIM(billing_country)) IN ('united arab emirates','uae','ae');
UPDATE public.clients SET billing_country = 'India'
  WHERE LOWER(TRIM(billing_country)) IN ('india','in');
UPDATE public.clients SET billing_country = 'Ireland'
  WHERE LOWER(TRIM(billing_country)) IN ('ireland','ie','republic of ireland');

UPDATE public.clients SET mailing_country = 'Canada'
  WHERE LOWER(TRIM(mailing_country)) IN ('canada','ca','can');
UPDATE public.clients SET mailing_country = 'USA'
  WHERE LOWER(TRIM(mailing_country)) IN ('united states','us','usa','united states of america');
UPDATE public.clients SET mailing_country = 'UAE'
  WHERE LOWER(TRIM(mailing_country)) IN ('united arab emirates','uae','ae');
UPDATE public.clients SET mailing_country = 'India'
  WHERE LOWER(TRIM(mailing_country)) IN ('india','in');
UPDATE public.clients SET mailing_country = 'Ireland'
  WHERE LOWER(TRIM(mailing_country)) IN ('ireland','ie','republic of ireland');

-- ─── sites.country / billing_country / mailing_country ────────────────

UPDATE public.sites SET country = 'Canada'
  WHERE LOWER(TRIM(country)) IN ('canada','ca','can');
UPDATE public.sites SET country = 'USA'
  WHERE LOWER(TRIM(country)) IN ('united states','us','usa','united states of america');
UPDATE public.sites SET country = 'UAE'
  WHERE LOWER(TRIM(country)) IN ('united arab emirates','uae','ae');
UPDATE public.sites SET country = 'India'
  WHERE LOWER(TRIM(country)) IN ('india','in');
UPDATE public.sites SET country = 'Ireland'
  WHERE LOWER(TRIM(country)) IN ('ireland','ie','republic of ireland');

UPDATE public.sites SET billing_country = 'Canada'
  WHERE LOWER(TRIM(billing_country)) IN ('canada','ca','can');
UPDATE public.sites SET billing_country = 'USA'
  WHERE LOWER(TRIM(billing_country)) IN ('united states','us','usa','united states of america');
UPDATE public.sites SET billing_country = 'UAE'
  WHERE LOWER(TRIM(billing_country)) IN ('united arab emirates','uae','ae');
UPDATE public.sites SET billing_country = 'India'
  WHERE LOWER(TRIM(billing_country)) IN ('india','in');
UPDATE public.sites SET billing_country = 'Ireland'
  WHERE LOWER(TRIM(billing_country)) IN ('ireland','ie','republic of ireland');

UPDATE public.sites SET mailing_country = 'Canada'
  WHERE LOWER(TRIM(mailing_country)) IN ('canada','ca','can');
UPDATE public.sites SET mailing_country = 'USA'
  WHERE LOWER(TRIM(mailing_country)) IN ('united states','us','usa','united states of america');
UPDATE public.sites SET mailing_country = 'UAE'
  WHERE LOWER(TRIM(mailing_country)) IN ('united arab emirates','uae','ae');
UPDATE public.sites SET mailing_country = 'India'
  WHERE LOWER(TRIM(mailing_country)) IN ('india','in');
UPDATE public.sites SET mailing_country = 'Ireland'
  WHERE LOWER(TRIM(mailing_country)) IN ('ireland','ie','republic of ireland');

COMMIT;
