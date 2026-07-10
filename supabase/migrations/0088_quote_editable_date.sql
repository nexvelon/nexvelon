-- 0088_quote_editable_date.sql
-- Quotes get an operator-editable `quote_date` — the date shown on the PDF —
-- decoupled from the row's created_at. Backfilled from created_at so every
-- existing quote keeps showing the same date it does today.
--
-- §2.1: additive nullable column. §2.2: no existing data narrowed; the full
-- Quote also carries `quoteDate` in its jsonb `data` blob (this column mirrors
-- it for querying/reporting).

BEGIN;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS quote_date date;

-- Backfill: existing quotes show their creation date until edited.
UPDATE public.quotes
   SET quote_date = created_at::date
 WHERE quote_date IS NULL;

COMMIT;

-- ═══════════════════════════════════════════════════════════
-- Rollback (per §1 — documented, not executed).
-- ═══════════════════════════════════════════════════════════
-- ALTER TABLE public.quotes DROP COLUMN IF EXISTS quote_date;
