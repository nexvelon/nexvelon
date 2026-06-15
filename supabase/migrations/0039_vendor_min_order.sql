-- 0039_vendor_min_order.sql
-- PARTS-4: capture two purchasing fields on a vendor —
--   • min_order_amount : the minimum / free-shipping order threshold ($).
--   • excluded_parts   : part numbers this vendor does NOT carry (jsonb array
--                        of text part numbers; defaults to []).
-- Additive, nullable / defaulted columns (§2.1 — never narrow). The threshold-
-- check / reorder→PO-send logic is deferred; this only stores + displays.
--
-- Applied via the Dashboard SQL Editor. (Authored from the PARTS-4 spec — if the
-- SQL run on the Dashboard differs, reconcile this file to match it.)

BEGIN;

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS min_order_amount numeric;

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS excluded_parts jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
