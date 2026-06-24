BEGIN;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS company_address_line1 text,
  ADD COLUMN IF NOT EXISTS company_address_line2 text,
  ADD COLUMN IF NOT EXISTS company_address_city text,
  ADD COLUMN IF NOT EXISTS company_address_province text,
  ADD COLUMN IF NOT EXISTS company_address_postal text,
  ADD COLUMN IF NOT EXISTS company_address_country text;

COMMIT;
