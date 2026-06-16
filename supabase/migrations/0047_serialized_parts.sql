-- 0047_serialized_parts.sql
-- SERIAL-1 (Batch D2): per-part serialized toggle + per-unit serial numbers.
--   • inventory_products.is_serialized — when true, each unit is tracked
--     individually by serial number (one stock row per unit, quantity 1).
--     Driven purely by this toggle; no cost threshold.
--   • inventory_stock.serial_number — the per-unit serial (already present in
--     earlier schema; IF NOT EXISTS keeps this idempotent).
--
-- Applied via the Dashboard SQL Editor.

BEGIN;
ALTER TABLE public.inventory_products
  ADD COLUMN IF NOT EXISTS is_serialized boolean NOT NULL DEFAULT false;
ALTER TABLE public.inventory_stock
  ADD COLUMN IF NOT EXISTS serial_number text;
COMMIT;
