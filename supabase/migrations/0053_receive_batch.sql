-- 0053_receive_batch.sql
-- FIX-BATCH-O: a stable identifier for a single receive/intake batch.
--   inventory_stock.receive_batch_id — one uuid shared by every row created in a
--     single receiveStock / addManualStock call. NULL on rows created any other
--     way (moveStock splits, adjustments) so they never look like receipts.
--   This makes "same-receipt" grouping unambiguous: grouping by (po_number,
--     created_at) would be confused by split rows that copy po_number with a new
--     created_at, and by manual adds that have no po_number.
--
-- Applied via the Dashboard SQL Editor.

BEGIN;
ALTER TABLE public.inventory_stock
  ADD COLUMN IF NOT EXISTS receive_batch_id uuid;
CREATE INDEX IF NOT EXISTS inventory_stock_receive_batch_idx ON public.inventory_stock(receive_batch_id);
COMMIT;
