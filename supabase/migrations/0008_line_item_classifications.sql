BEGIN;

-- QB-5b: Admin-editable catalog of line item classifications.
-- Replaces (with fallback) the hardcoded array in lib/classifications.ts.

CREATE TABLE IF NOT EXISTS public.line_item_classifications (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL UNIQUE,
  applies_to    text        NOT NULL CHECK (applies_to IN ('product', 'labor', 'misc', 'both')),
  display_order integer     NOT NULL DEFAULT 0,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid        REFERENCES auth.users(id),
  updated_by    uuid        REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_line_item_classifications_applies_to
  ON public.line_item_classifications (applies_to);
CREATE INDEX IF NOT EXISTS idx_line_item_classifications_display_order
  ON public.line_item_classifications (display_order);
CREATE INDEX IF NOT EXISTS idx_line_item_classifications_is_active
  ON public.line_item_classifications (is_active) WHERE is_active = true;

-- Seed the 5 current hardcoded entries (idempotent via ON CONFLICT).
INSERT INTO public.line_item_classifications (name, applies_to, display_order, is_active)
VALUES
  ('Materials',            'product', 1, true),
  ('Subcontractor Labour', 'labor',   2, true),
  ('Technician Labour',    'labor',   3, true),
  ('Project Management',   'labor',   4, true),
  ('Misc',                 'misc',    1, true)
ON CONFLICT (name) DO NOTHING;

-- RLS: authenticated read; writes are gated at the server-action layer with requireAdmin.
ALTER TABLE public.line_item_classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read line_item_classifications"
  ON public.line_item_classifications
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can write line_item_classifications"
  ON public.line_item_classifications
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- updated_at trigger: reuse the shared public.handle_updated_at() defined in
-- 0001_clients_schema.sql (already used by clients / sites / contacts /
-- profiles). No local trigger function needed.
CREATE TRIGGER set_line_item_classifications_updated_at
  BEFORE UPDATE ON public.line_item_classifications
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

COMMIT;
