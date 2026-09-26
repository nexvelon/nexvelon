-- 0130_email_log.sql
-- MAIL-1 — a durable record of every outbound email the app sends, so "did the
-- client ever get it?" is answered from the app, not from memory. One row per
-- send attempt (success OR failure) written by the central dispatcher
-- (lib/email/dispatch.ts) through the SERVICE-ROLE client.
--
-- §3 boilerplate: authenticated may READ (an operator/admin views the log); it
-- has NO write policy — all writes go via service-role, which bypasses RLS. No
-- anon access. Not FK'd to quotes/vendors/etc. — entity_type/entity_id are a
-- loose reference (entity ids across the app mix text and uuid; kept text here,
-- like quote_audit_log 0040) so a delete of the referenced row never blocks or
-- rewrites the mail record.

BEGIN;

CREATE TABLE IF NOT EXISTS public.email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'client' (outbound to a client/vendor/sub) | 'internal' (auth/ops notices).
  -- No CHECK — kinds may grow (§1); the app sets them.
  kind text NOT NULL,
  to_email text NOT NULL,
  from_email text NOT NULL,
  reply_to text,
  bcc text,
  subject text,
  -- Loose reference to the originating record (e.g. 'quote' + quotes.id text).
  entity_type text,
  entity_id text,
  sent_by uuid,                      -- the operator who triggered it, when known
  provider_message_id text,          -- Resend message id (null on failure)
  status text NOT NULL,              -- 'sent' | 'failed'
  error text,                        -- provider/exception message on failure
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Hot paths: newest-first list, per-entity ("did quote X send?"), per-recipient.
CREATE INDEX IF NOT EXISTS email_log_created_idx ON public.email_log (created_at DESC);
CREATE INDEX IF NOT EXISTS email_log_entity_idx  ON public.email_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS email_log_to_idx      ON public.email_log (to_email);
CREATE INDEX IF NOT EXISTS email_log_status_idx  ON public.email_log (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_log TO service_role;

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

-- SELECT only for authenticated; writes via service-role (mirrors quote_audit_log
-- 0038 / quote_portal_sends 0129).
CREATE POLICY email_log_select_authenticated
  ON public.email_log FOR SELECT TO authenticated USING (true);

COMMIT;

-- ── Existence check (after applying) ─────────────────────────────────────────
--   SELECT table_name FROM information_schema.tables WHERE table_schema='public'
--     AND table_name='email_log';                                    -- 1
--   SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='email_log';  -- 4
--   SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='email_log'; -- 1 (SELECT)
--
-- ── Reverse migration (commented) ────────────────────────────────────────────
--   BEGIN;
--   DROP TABLE IF EXISTS public.email_log;
--   COMMIT;
