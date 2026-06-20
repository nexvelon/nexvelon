BEGIN;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_tier_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_tier_check CHECK (tier IS NULL OR tier IN ('Diamond','Platinum','Gold','Silver','Bronze'));

ALTER TABLE public.client_invitations
  DROP CONSTRAINT IF EXISTS client_invitations_tier_requested_check;
ALTER TABLE public.client_invitations
  ADD CONSTRAINT client_invitations_tier_requested_check CHECK (tier_requested IS NULL OR tier_requested IN ('Diamond','Platinum','Gold','Silver','Bronze'));

COMMIT;
