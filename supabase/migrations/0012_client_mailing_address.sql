-- 0012_client_mailing_address.sql
-- CL-5b: Add mailing address fields to clients
-- Mirrors 0007's billing_* columns structure

BEGIN;

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS mailing_street text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS mailing_unit text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS mailing_city text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS mailing_province text DEFAULT 'ON';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS mailing_postal text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS mailing_country text DEFAULT 'Canada';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS mailing_same_as_billing boolean NOT NULL DEFAULT false;

COMMIT;
