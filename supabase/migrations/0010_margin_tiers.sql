BEGIN;

-- QB-12: Admin-editable margin tiers per category (display-only for now;
-- a future phase may add explicit per-line "Apply tier margin" UX behind
-- the Snapshot Principle).

CREATE TABLE IF NOT EXISTS public.margin_tiers (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category      text        NOT NULL UNIQUE,
  tier_1        numeric(5,2) NOT NULL DEFAULT 0 CHECK (tier_1 >= 0 AND tier_1 <= 100),
  tier_2        numeric(5,2) NOT NULL DEFAULT 0 CHECK (tier_2 >= 0 AND tier_2 <= 100),
  tier_3        numeric(5,2) NOT NULL DEFAULT 0 CHECK (tier_3 >= 0 AND tier_3 <= 100),
  display_order integer     NOT NULL DEFAULT 0,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid        REFERENCES auth.users(id),
  updated_by    uuid        REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_margin_tiers_display_order
  ON public.margin_tiers (display_order);
CREATE INDEX IF NOT EXISTS idx_margin_tiers_is_active
  ON public.margin_tiers (is_active) WHERE is_active = true;

-- Seed the 5 categories currently hardcoded in QuoteDefaults().
INSERT INTO public.margin_tiers (category, tier_1, tier_2, tier_3, display_order, is_active)
VALUES
  ('Access Control',   30, 25, 18, 1, true),
  ('CCTV',             32, 26, 20, 2, true),
  ('Intrusion',        28, 22, 16, 3, true),
  ('Intercom',         30, 24, 18, 4, true),
  ('Cabling & Power',  22, 18, 14, 5, true)
ON CONFLICT (category) DO NOTHING;

-- RLS: authenticated read; writes gated at the server-action layer with requireAdmin.
ALTER TABLE public.margin_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read margin_tiers"
  ON public.margin_tiers
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can write margin_tiers"
  ON public.margin_tiers
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Reuse the shared public.handle_updated_at() trigger function (defined in
-- 0001_clients_schema.sql).
CREATE TRIGGER set_margin_tiers_updated_at
  BEFORE UPDATE ON public.margin_tiers
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

COMMIT;
