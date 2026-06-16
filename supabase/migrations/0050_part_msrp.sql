-- 0050_part_msrp.sql
-- PART-FORM-2: MSRP + the part's quote-default chooser.
--   inventory_products.msrp           — Manufacturer's suggested retail price.
--                                       Reference only; never the quote default.
--   inventory_products.margin_tier_id — the margin tier a part uses as its quote
--                                       default (tier mode). The chooser's three
--                                       modes are DERIVED with no mode column:
--                                         margin_tier_id set → "Use margin tier"
--                                         else list_price set → "Fixed price"
--                                         else               → "None — set on quote"
-- (The spec assumed an existing per-part tier field; none existed, so this adds
--  one. list_price keeps holding the fixed price — no data migration needed.)
--
-- Applied via the Dashboard SQL Editor.

BEGIN;
ALTER TABLE public.inventory_products
  ADD COLUMN IF NOT EXISTS msrp numeric,
  ADD COLUMN IF NOT EXISTS margin_tier_id uuid REFERENCES public.margin_tiers(id) ON DELETE SET NULL;
COMMIT;
