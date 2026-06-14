-- 0037_sites_status_in_quote.sql
-- SITE-FIELDS: add 'In Quote' as an allowed sites.status value (the first
-- lifecycle stage — a site captured while still being quoted). Widens the
-- status CHECK by DROP + RE-ADD (§2.1 — never narrow; this only adds a value).
-- The original CHECK was defined inline in 0001_clients_schema.sql, so its
-- auto-generated name is discovered dynamically before being dropped.
--
-- Applied via the Dashboard SQL Editor.

BEGIN;
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'public.sites'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%Decommissioned%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE public.sites DROP CONSTRAINT %I', c); END IF;
END $$;
ALTER TABLE public.sites
  ADD CONSTRAINT sites_status_check
  CHECK (status IN ('In Quote','Active','In Project','Maintained','Decommissioned'));
COMMIT;
