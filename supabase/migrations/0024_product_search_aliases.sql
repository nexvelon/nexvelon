-- 0024_product_search_aliases.sql
-- Chunk C-1: alternate search terms for catalog products (old part numbers,
-- nicknames, common misspellings) so a part is findable when the operator
-- doesn't recall the exact Part #. A text[] column is sufficient — no separate
-- table. NOT NULL DEFAULT '{}' so existing rows read as an empty alias list.

BEGIN;

ALTER TABLE public.inventory_products
  ADD COLUMN IF NOT EXISTS search_aliases text[] NOT NULL DEFAULT '{}';

COMMIT;
