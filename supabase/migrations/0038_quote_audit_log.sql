-- 0038_quote_audit_log.sql
-- AUDIT-1: dedicated, immutable, append-only audit trail for quotes. Quotes are
-- deliberately NOT in activity_log (its entity_type CHECK excludes 'quote' by
-- design — see 0016). One row per audited event (create / status transition;
-- content-field diffs land in AUDIT-2).
--
-- Immutability: RLS is enabled with ONLY an admin-only SELECT policy. There are
-- NO insert/update/delete policies, so no one (not even an Admin) can mutate or
-- remove rows through the app. Writes are performed by the SERVICE-ROLE client
-- (createAdminClient / BYPASSRLS) from the server action only — mirrors the
-- auth_audit_log convention (0002).
--
-- Applied via the Dashboard SQL Editor.

BEGIN;

CREATE TABLE IF NOT EXISTS public.quote_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL,
  actor_id uuid,
  actor_name text,
  event_type text NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quote_audit_log_quote_idx ON public.quote_audit_log (quote_id, created_at);

ALTER TABLE public.quote_audit_log ENABLE ROW LEVEL SECURITY;

-- admin-only read; NO insert/update/delete policies → append-only & immutable.
-- Writes go via the service-role client (BYPASSRLS). No one (incl. admin) can update/delete.
DROP POLICY IF EXISTS quote_audit_log_admin_select ON public.quote_audit_log;
CREATE POLICY quote_audit_log_admin_select ON public.quote_audit_log
  FOR SELECT TO authenticated USING (public.is_admin());

COMMIT;
