-- 0052_category_tree.sql
-- PART-FIX-2: hierarchical, per-parent sub-categories.
--   inventory_categories     — an arbitrary-depth category tree (self-FK
--                              parent_id, ON DELETE CASCADE = deleting a node
--                              removes its whole subtree). UNIQUE(parent_id,
--                              name) keeps names unique only within a parent, so
--                              sub-categories are local to each branch.
--   inventory_products.category_id — the leaf category a part lands on.
-- The legacy free-text category / subcategory columns are KEPT AS-IS — no
-- migration, no drop. Parts not re-saved render their legacy strings exactly as
-- before; only newly-categorized parts populate category_id.
-- RLS: authenticated SELECT + write (mirrors the manufacturers posture);
-- updated_at via the shared handle_updated_at() trigger.
--
-- Applied via the Dashboard SQL Editor.

BEGIN;

CREATE TABLE IF NOT EXISTS public.inventory_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.inventory_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_id, name)
);
CREATE INDEX IF NOT EXISTS inventory_categories_parent_idx ON public.inventory_categories(parent_id);

ALTER TABLE public.inventory_products
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.inventory_categories(id) ON DELETE SET NULL;

DROP TRIGGER IF EXISTS set_updated_at ON public.inventory_categories;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.inventory_categories FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_categories_select_authenticated ON public.inventory_categories;
CREATE POLICY inventory_categories_select_authenticated ON public.inventory_categories FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS inventory_categories_write_authenticated ON public.inventory_categories;
CREATE POLICY inventory_categories_write_authenticated ON public.inventory_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
