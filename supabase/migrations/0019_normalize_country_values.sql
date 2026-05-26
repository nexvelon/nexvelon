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

BEGIN;

-- ─── clients.country / billing_country / mailing_country ──────────────

UPDATE public.clients SET country = 'Canada'
  WHERE LOWER(TRIM(country)) IN ('canada','ca','can');
UPDATE public.clients SET country = 'USA'
  WHERE LOWER(TRIM(country)) IN ('united states','us','usa','united states of america');
UPDATE public.clients SET country = 'UAE'
  WHERE LOWER(TRIM(country)) IN ('united arab emirates','uae','ae');
UPDATE public.clients SET country = 'India'
  WHERE LOWER(TRIM(country)) IN ('india','in');
UPDATE public.clients SET country = 'Ireland'
  WHERE LOWER(TRIM(country)) IN ('ireland','ie','republic of ireland');

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
