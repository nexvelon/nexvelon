-- 0051_part_pack.sql
-- PART-FIX-1: pack-size + sub-allocate for non-"Each" units of measure.
--   inventory_products.pack_size              — items inside one pack unit
--                                               (Box/Case/Pack/…). Required in
--                                               the UI when UoM isn't "Each".
--   inventory_products.track_individual_units — when true, receiving one pack
--                                               expands into pack_size trackable
--                                               stock rows; when false the pack
--                                               is one inventory unit (today's
--                                               behaviour).
--
-- Applied via the Dashboard SQL Editor.

BEGIN;
ALTER TABLE public.inventory_products
  ADD COLUMN IF NOT EXISTS pack_size numeric,
  ADD COLUMN IF NOT EXISTS track_individual_units boolean NOT NULL DEFAULT false;
COMMIT;
