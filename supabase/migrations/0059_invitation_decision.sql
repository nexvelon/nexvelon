-- 0059_invitation_decision.sql
-- POLISH-5: the admin's review decision is recorded on the invitation itself so
-- it survives even when a declined pending-client row is hard-deleted — i.e. we
-- can always look back and see "this email was approved / declined on this date
-- by whom". (0058 carries the tier columns on clients; this is the companion
-- audit trail on client_invitations.)
--
-- Applied via the Dashboard SQL Editor.

BEGIN;
ALTER TABLE public.client_invitations
  ADD COLUMN IF NOT EXISTS decision text CHECK (decision IS NULL OR decision IN ('approved','declined')),
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS decided_by uuid,
  -- The decline reason is kept HERE (not only on the soon-deleted client row)
  -- so the audit trail survives a hard-delete of the declined pending client.
  ADD COLUMN IF NOT EXISTS decline_reason text;
COMMIT;
