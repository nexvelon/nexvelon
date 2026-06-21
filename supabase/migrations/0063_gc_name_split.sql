BEGIN;

ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS gc_first_name text,
  ADD COLUMN IF NOT EXISTS gc_last_name text;

-- Migrate any existing gc_name into gc_first_name (single-field fallback for any pre-existing data).
-- No legacy data is expected (POLISH-6 only added gc_name; no sites were saved yet using it). Defensive nonetheless.
UPDATE public.sites
SET gc_first_name = gc_name
WHERE gc_name IS NOT NULL AND gc_first_name IS NULL;

ALTER TABLE public.sites
  DROP COLUMN IF EXISTS gc_name;

COMMIT;
