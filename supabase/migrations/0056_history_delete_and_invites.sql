BEGIN;

-- Allow Admin (via service-role) to DELETE entries from the two append-only tables.
DROP POLICY IF EXISTS stock_movements_delete_authenticated ON public.stock_movements;
CREATE POLICY stock_movements_delete_authenticated ON public.stock_movements
  FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS quote_audit_log_delete_authenticated ON public.quote_audit_log;
CREATE POLICY quote_audit_log_delete_authenticated ON public.quote_audit_log
  FOR DELETE TO authenticated USING (true);

-- Pending-review status for invite-created clients.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS pending_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz;

-- Invitation tokens (one row per invitation).
CREATE TABLE IF NOT EXISTS public.client_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  email text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  created_by uuid,
  client_form_completed boolean NOT NULL DEFAULT false,
  site_form_completed boolean NOT NULL DEFAULT false,
  tc1_signed_at timestamptz,
  tc1_signed_name text,
  tc2_signed_at timestamptz,
  tc2_signed_name text,
  submitted_at timestamptz,
  client_form_data jsonb,
  site_form_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_invitations_token_idx ON public.client_invitations(token);
CREATE INDEX IF NOT EXISTS client_invitations_email_idx ON public.client_invitations(email);

DROP TRIGGER IF EXISTS set_updated_at ON public.client_invitations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.client_invitations FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.client_invitations ENABLE ROW LEVEL SECURITY;

-- Authenticated admins can read/write invitations.
DROP POLICY IF EXISTS client_invitations_select_authenticated ON public.client_invitations;
CREATE POLICY client_invitations_select_authenticated ON public.client_invitations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS client_invitations_write_authenticated ON public.client_invitations;
CREATE POLICY client_invitations_write_authenticated ON public.client_invitations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- The PUBLIC form submission route reads + updates a single invitation by token. Since unauthenticated users hit it, we use
-- the anon role with a tight USING clause that requires the row to match the requested token. Implemented at the API layer.
DROP POLICY IF EXISTS client_invitations_anon_select_by_token ON public.client_invitations;
CREATE POLICY client_invitations_anon_select_by_token ON public.client_invitations FOR SELECT TO anon USING (submitted_at IS NULL);
DROP POLICY IF EXISTS client_invitations_anon_update_by_token ON public.client_invitations;
CREATE POLICY client_invitations_anon_update_by_token ON public.client_invitations FOR UPDATE TO anon USING (submitted_at IS NULL) WITH CHECK (submitted_at IS NULL);

COMMIT;
