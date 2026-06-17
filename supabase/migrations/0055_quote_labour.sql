BEGIN;

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value_text text,
  value_numeric numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_settings (key, value_numeric)
VALUES ('default_labour_sell_rate', 125)
ON CONFLICT (key) DO NOTHING;

DROP TRIGGER IF EXISTS set_updated_at ON public.app_settings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_settings_select_authenticated ON public.app_settings;
CREATE POLICY app_settings_select_authenticated ON public.app_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS app_settings_write_authenticated ON public.app_settings;
CREATE POLICY app_settings_write_authenticated ON public.app_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
