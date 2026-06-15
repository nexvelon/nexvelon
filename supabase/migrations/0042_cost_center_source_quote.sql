-- 0042_cost_center_source_quote.sql
-- PROJ-2: every cost center records the quote it came from (provenance) — the
-- originating quote for PROJ-1-seeded centers, or the change-order quote for
-- centers added by a merge. text FK (quotes.id is text); ON DELETE SET NULL.
-- Additive, nullable column (§2.1 — never narrow).
--
-- Applied via the Dashboard SQL Editor.

BEGIN;
ALTER TABLE public.project_cost_centers
  ADD COLUMN IF NOT EXISTS source_quote_id text REFERENCES public.quotes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS project_cost_centers_source_quote_idx ON public.project_cost_centers(source_quote_id);
COMMIT;
