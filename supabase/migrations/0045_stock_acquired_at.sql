-- 0045_stock_acquired_at.sql
-- PART-DETAIL (Batch B2): formalize inventory_stock.acquired_at — the date a
-- stock unit/lot was acquired (received on a PO, or entered via manual add).
-- Nullable: manual stock-add leaves it blank unless the operator sets a date.
-- Displayed with a created_at fallback when null.
--
-- Applied via the Dashboard SQL Editor.

BEGIN;
ALTER TABLE public.inventory_stock
  ADD COLUMN IF NOT EXISTS acquired_at timestamptz;
COMMIT;
