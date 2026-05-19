BEGIN;

-- QB-11: Add 'service' as a valid applies_to value for line item
-- classifications. Migrate Warranty Cost and Service Cost from 'labor' to
-- 'service'. Past-data preservation: this is a transformative UPDATE, not a
-- wipe — names / order / activity are untouched, only applies_to changes.

-- The applies_to CHECK was added inline in 0008 (with an implicit name).
-- Find and drop it, then recreate with 'service' added.
DO $$
DECLARE
  c_name text;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid = 'public.line_item_classifications'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%applies_to%';

  IF c_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.line_item_classifications DROP CONSTRAINT %I',
      c_name
    );
  END IF;
END $$;

ALTER TABLE public.line_item_classifications
  ADD CONSTRAINT line_item_classifications_applies_to_check
  CHECK (applies_to IN ('product', 'labor', 'misc', 'both', 'service'));

-- Migrate Warranty Cost and Service Cost from labor to service. Conditional:
-- only rows that exist and are still 'labor' are touched (idempotent re-run
-- safe; a no-op if the rows don't exist in this environment).
UPDATE public.line_item_classifications
  SET applies_to = 'service', updated_at = now()
  WHERE name IN ('Warranty Cost', 'Service Cost')
    AND applies_to = 'labor';

COMMIT;
