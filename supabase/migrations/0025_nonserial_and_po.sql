-- 0025_nonserial_and_po.sql
-- Chunk C-2a: third tracking mode 'non_serialized' + a purchase-order number on
-- stock receipts.
--
-- The 0021 tracking_mode CHECK was an inline (unnamed) column constraint, so
-- Postgres auto-named it inventory_products_tracking_mode_check. We DROP that
-- and re-add a widened, explicitly-named constraint that ALSO permits
-- 'non_serialized' (§2.1: widen, never narrow — 'serialized' + 'bulk' stay
-- valid so existing rows are untouched).
--
-- po_number is a free-text optional column on inventory_stock, stamped on every
-- row of a receipt.

BEGIN;

ALTER TABLE public.inventory_products
  DROP CONSTRAINT IF EXISTS inventory_products_tracking_mode_check;
ALTER TABLE public.inventory_products
  ADD CONSTRAINT inventory_products_tracking_mode_check
  CHECK (tracking_mode IN ('serialized','bulk','non_serialized'));

ALTER TABLE public.inventory_stock
  ADD COLUMN IF NOT EXISTS po_number text;

COMMIT;
