BEGIN;

-- Billing address
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS billing_street text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS billing_unit text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS billing_city text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS billing_province text DEFAULT 'ON';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS billing_postal text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS billing_country text DEFAULT 'Canada';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS billing_same_as_primary_site boolean NOT NULL DEFAULT false;

-- Operating company assignment
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS default_opco text NOT NULL DEFAULT 'integrated_solutions'
  CHECK (default_opco IN ('integrated_solutions','guardian'));
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS allowed_opcos text[] NOT NULL DEFAULT '{integrated_solutions}';

-- Tax
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS client_hst_gst_number text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS tax_exempt boolean NOT NULL DEFAULT false;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS tax_exempt_certificate_number text;

-- Payment terms & method
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS payment_terms text NOT NULL DEFAULT 'net_30'
  CHECK (payment_terms IN ('due_on_receipt','net_7','net_15','net_30','net_60','net_90','custom'));
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS payment_terms_custom text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS preferred_payment_method text NOT NULL DEFAULT 'eft'
  CHECK (preferred_payment_method IN ('cheque','eft','credit_card','e_transfer','wire'));
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS apply_cc_surcharge boolean NOT NULL DEFAULT true;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS credit_limit numeric(12,2);
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS credit_hold boolean NOT NULL DEFAULT false;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS preferred_currency text NOT NULL DEFAULT 'CAD'
  CHECK (preferred_currency IN ('CAD','USD'));

-- Portal access flag
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS portal_access_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS portal_contact_email text;

-- Soft delete attribution (deleted_at already existed)
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);

COMMIT;
