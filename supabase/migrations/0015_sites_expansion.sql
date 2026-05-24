-- 0015_sites_expansion.sql
-- SITES-2a: Add billing/mailing/tax/payment/portal columns to sites.
--
-- Mirrors the clients 0007 + 0012 patterns exactly (same enum values, same
-- numeric precision, same CHECK constraint shape, same `IF NOT EXISTS` for
-- idempotency). Deliberate divergence from clients: the three inheritance
-- flags (billing_same_as_client / mailing_same_as_billing /
-- inherit_payment_terms_from_client) default TRUE on sites — a site
-- without explicit billing should inherit from its parent client by
-- default. Clients have no parent, so the equivalent client flags default
-- FALSE.
--
-- All 28 new columns; tax_rate uses numeric(5,3) so QC's 14.975% fits
-- exactly (range -99.999 → 99.999). The existing 6 "systems" columns
-- (panel_system / intrusion_system / cameras_count / controllers_count /
-- doors_count / cards_issued) are left untouched per §2.1 past-data
-- preservation — SITES-2b removes them from the UI only.

BEGIN;

-- ─── Site billing address (mirrors clients 0007 billing_*) ───
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS billing_street text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS billing_unit text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS billing_city text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS billing_province text DEFAULT 'ON';
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS billing_postal text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS billing_country text DEFAULT 'Canada';
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS billing_same_as_client boolean NOT NULL DEFAULT true;

-- ─── Site mailing address (mirrors clients 0012 mailing_*) ───
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS mailing_street text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS mailing_unit text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS mailing_city text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS mailing_province text DEFAULT 'ON';
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS mailing_postal text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS mailing_country text DEFAULT 'Canada';
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS mailing_same_as_billing boolean NOT NULL DEFAULT true;

-- ─── Tax ───
-- `site_hst_gst_number` prefix mirrors `client_hst_gst_number` on clients.
-- tax_rate is numeric(5,3) so QC's 14.975% rate stores exactly; nullable
-- so the UI can fall back to a province-based default at render time.
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS site_hst_gst_number text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS tax_exempt boolean NOT NULL DEFAULT false;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS tax_exempt_certificate_number text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS tax_rate numeric(5,3);

-- ─── Payment terms & method (mirrors clients 0007 payment_*) ───
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS payment_terms text NOT NULL DEFAULT 'net_30'
  CHECK (payment_terms IN ('due_on_receipt','net_7','net_15','net_30','net_60','net_90','custom'));
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS payment_terms_custom text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS preferred_payment_method text NOT NULL DEFAULT 'eft'
  CHECK (preferred_payment_method IN ('cheque','eft','credit_card','e_transfer','wire'));
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS apply_cc_surcharge boolean NOT NULL DEFAULT true;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS credit_limit numeric(12,2);
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS credit_hold boolean NOT NULL DEFAULT false;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS preferred_currency text NOT NULL DEFAULT 'CAD'
  CHECK (preferred_currency IN ('CAD','USD'));

-- ─── Portal access ───
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS portal_access_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS portal_contact_email text;

-- ─── Inheritance toggle (live "Same as client" for payment/tax/portal) ───
-- Billing-address inheritance is the `billing_same_as_client` flag above;
-- mailing inheritance is `mailing_same_as_billing` above. This third flag
-- covers payment + tax + portal as a single group — can split additively
-- into per-section flags later if needed.
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS inherit_payment_terms_from_client boolean NOT NULL DEFAULT true;

COMMIT;
