BEGIN;

ALTER TABLE public.client_invitations
  ADD COLUMN IF NOT EXISTS tc1_signature_data_url text,
  ADD COLUMN IF NOT EXISTS tc2_signature_data_url text;

COMMIT;
