-- 0044_manufacturers_and_part_notes.sql
-- PART-FORM (Batch B1):
--   • manufacturers — a managed list (Settings → Manufacturers) powering the
--     part form's Manufacturer dropdown. inventory_products.manufacturer stays
--     free text (no FK, no data migration) — this table just feeds the options.
--   • inventory_products.notes — free-text part notes shown at the bottom of
--     the part form.
-- RLS: authenticated SELECT + write (mirrors the inventory posture);
-- updated_at via the shared handle_updated_at() trigger.
--
-- Applied via the Dashboard SQL Editor.

BEGIN;

CREATE TABLE IF NOT EXISTS public.manufacturers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_products
  ADD COLUMN IF NOT EXISTS notes text;

DROP TRIGGER IF EXISTS set_updated_at ON public.manufacturers;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.manufacturers FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.manufacturers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS manufacturers_select_authenticated ON public.manufacturers;
CREATE POLICY manufacturers_select_authenticated ON public.manufacturers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS manufacturers_write_authenticated ON public.manufacturers;
CREATE POLICY manufacturers_write_authenticated ON public.manufacturers FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
