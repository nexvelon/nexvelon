BEGIN;

ALTER TABLE public.client_invitations
  ADD COLUMN IF NOT EXISTS invite_type text NOT NULL DEFAULT 'full' CHECK (invite_type IN ('full', 'site_only'));

COMMIT;
