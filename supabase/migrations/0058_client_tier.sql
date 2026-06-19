BEGIN;
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS tier text CHECK (tier IS NULL OR tier IN ('bronze','silver','gold','platinum')),
  ADD COLUMN IF NOT EXISTS tier_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS decline_reason text;
COMMIT;
