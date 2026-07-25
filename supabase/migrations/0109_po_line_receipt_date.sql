-- INV-9-1 (migration 0109) — receipt-date stamping for vendor performance metrics.
--
-- receivePurchaseOrderLines advances purchase_order_lines.received_qty but has
-- never recorded WHEN a line was received. Without a receipt date, lead time
-- (received − issued) and on-time delivery (received ≤ expected) can't be
-- computed. This adds:
--
--   purchase_order_lines.last_received_at  — the date of the most recent receipt
--     against the line (stamped each time received_qty advances). Per-line granularity
--     is enough for v1 metrics; a line receives in one or a few batches.
--
--   purchase_orders.fully_received_at      — the date the PO reached 'received'
--     (all lines fully received). This is the clean anchor for PO-level on-time %
--     and lead time — a PO is "on time" when it's COMPLETELY received by its
--     expected_date, which is the meaningful business question ("did the vendor
--     deliver the order on time"), not per-line partials.
--
-- Both are DATE (matching order_date / expected_date / ship_by_date). No new
-- tables → no §3 grants/RLS needed (ALTER on existing, already-policied tables).
--
-- NO BACKFILL. Historical received_qty has no associated date and there is no
-- honest way to reconstruct one, so these stay NULL for already-received POs.
-- Delivery metrics therefore compute only over POs received going forward; the
-- API surfaces the earliest dated receipt as `metrics_since` and returns NULL
-- (never a fabricated 0%/100%) when there is no dated receipt yet. Same stance
-- as INV-9-0: honesty over invented data.

BEGIN;

ALTER TABLE public.purchase_order_lines
  ADD COLUMN IF NOT EXISTS last_received_at date;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS fully_received_at date;

COMMIT;
