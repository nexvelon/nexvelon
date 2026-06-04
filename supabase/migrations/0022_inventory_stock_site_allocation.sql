-- 0022_inventory_stock_site_allocation.sql
-- INV-3b: allocate stock units/lots to sites (§8). status='allocated' + site_id set => allocated;
-- return => status='in_stock', site_id NULL. Whole-row allocation only (partial-bulk deferred).
--
-- site_id is nullable (NULL = not allocated). ON DELETE RESTRICT: a site cannot be
-- deleted while units are allocated to it — intended integrity (operator must
-- return the units first). RLS is already enabled on inventory_stock (0021); the
-- new column is covered by the existing policies.

BEGIN;

ALTER TABLE public.inventory_stock
  ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.sites(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS inventory_stock_site_id_idx ON public.inventory_stock (site_id);

COMMIT;
