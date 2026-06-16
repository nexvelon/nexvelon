-- 0049_invoice_line_part.sql
-- MATERIALS-1 (Batch D5): bill a project's consumed/assigned parts onto an
-- invoice, + per-invoice identifier display toggles.
--   invoice_lines.product_id      — the catalog part a material line bills.
--   invoice_lines.source_stock_id — the specific stock unit billed (set for a
--                                   single serialized unit; null for a grouped
--                                   bulk line). ON DELETE SET NULL keeps history.
--   invoices.line_identifier_fields — which part identifiers compose a material
--                                   line's text (any combination of
--                                   master_part_number | part_number | name |
--                                   description). Defaults to {name}.
-- source_type gains a 'material' value (free text — no CHECK to alter).
--
-- Applied via the Dashboard SQL Editor.

BEGIN;
ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.inventory_products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_stock_id uuid REFERENCES public.inventory_stock(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS invoice_lines_product_idx ON public.invoice_lines(product_id);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS line_identifier_fields text[] NOT NULL DEFAULT ARRAY['name']::text[];
COMMIT;
