BEGIN;

ALTER TABLE public.client_invitations
  ADD COLUMN IF NOT EXISTS client_form_payment_policies_acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS site_form_payment_policies_acknowledged_at timestamptz;

COMMIT;
