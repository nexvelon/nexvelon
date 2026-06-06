-- 0026_product_addons.sql
-- Chunk D-1: companion add-ons for catalog products.
--   notify_addons — when true, the quote builder prompts to also add this
--     part's add-ons when the part is added to a quote (wired in D-2).
--   addons — ordered list of { kind: 'part' | 'text', value }. 'part' values
--     are inventory_products UUIDs (resolved + skipped-if-deleted at render —
--     no FK on the JSON refs); 'text' values are free-text reminders.
-- Both NOT NULL with defaults so existing rows read as "no add-ons".

BEGIN;

ALTER TABLE public.inventory_products
  ADD COLUMN IF NOT EXISTS notify_addons boolean NOT NULL DEFAULT false;

ALTER TABLE public.inventory_products
  ADD COLUMN IF NOT EXISTS addons jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
