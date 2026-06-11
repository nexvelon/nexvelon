BEGIN;
ALTER TABLE public.inventory_products
  ADD COLUMN IF NOT EXISTS upc text,
  ADD COLUMN IF NOT EXISTS master_part_number text,
  ADD COLUMN IF NOT EXISTS replacement_part_number text;
CREATE INDEX IF NOT EXISTS inventory_products_upc_idx                 ON public.inventory_products (upc);
CREATE INDEX IF NOT EXISTS inventory_products_master_part_number_idx  ON public.inventory_products (master_part_number);
COMMIT;
