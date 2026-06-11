BEGIN;

CREATE TABLE IF NOT EXISTS public.vendors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  contact_name    text,
  email           text,
  phone           text,
  website         text,
  address_line1   text,
  address_line2   text,
  city            text,
  province        text,
  postal_code     text,
  country         text,
  account_number  text,
  payment_terms   text,
  notes           text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_by      uuid
);

CREATE INDEX IF NOT EXISTS vendors_name_idx      ON public.vendors (name);
CREATE INDEX IF NOT EXISTS vendors_is_active_idx ON public.vendors (is_active);

DROP TRIGGER IF EXISTS vendors_set_updated_at ON public.vendors;
CREATE TRIGGER vendors_set_updated_at
  BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendors_select_authenticated ON public.vendors;
CREATE POLICY vendors_select_authenticated ON public.vendors
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS vendors_write_authenticated ON public.vendors;
CREATE POLICY vendors_write_authenticated ON public.vendors
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
