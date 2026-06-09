-- 0028_company_settings.sql
-- Chunk 2: org-wide key/value settings store. First key is 'default_quote_terms'
-- (the editable default Terms & Conditions seeded onto new quotes). A generic
-- key/value singleton — the home the AG/AH handoffs flagged as missing — so
-- future org-level defaults reuse it instead of adding per-concern tables.
--
-- Mirrors the managed-list posture: shared handle_updated_at() trigger, RLS
-- authenticated read + write (writes additionally requireAdmin at the action
-- layer). NO seed row — the table starts empty and the DEFAULT_TERMS const is
-- the fallback baseline (readers do `stored ?? DEFAULT_TERMS`).

BEGIN;

CREATE TABLE IF NOT EXISTS public.company_settings (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id)
);

CREATE TRIGGER company_settings_set_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_settings_select_authenticated" ON public.company_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "company_settings_write_authenticated" ON public.company_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
