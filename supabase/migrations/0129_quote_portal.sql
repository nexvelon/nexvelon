-- 0129_quote_portal.sql
-- QUOTE-PORTAL-1 — client e-acceptance portal (/q/<token>). A prospect opens a
-- signed link on their phone, sees exactly what was sent, and accepts or declines —
-- no account. The two things that make an acceptance legally meaningful:
--   1. an IMMUTABLE send SNAPSHOT (§2.2) — the portal renders and the client
--      accepts the snapshot, never the live quote, so editing the quote after send
--      can never change what was agreed to; and
--   2. an APPEND-ONLY acceptance record (§5) — signature + identity + timestamp
--      that cannot be edited or deleted.
--
-- No anon grant: the public /q/<token> route reads through a server component using
-- the SERVICE-ROLE client, scoped by the unguessable token — exactly the
-- client-invitations pattern (0056). Row access below is authenticated-SELECT only
-- (operators view status + the signed record); all writes go through service-role.
--
-- Quotes keep their own audit trail (quote_audit_log, 0038) — activity_log's
-- entity_type CHECK deliberately excludes 'quote' — so portal events
-- (sent/viewed/accepted/declined) are logged there, NOT in activity_log. No
-- entity_type widening is needed.

BEGIN;

-- ── quote_portal_sends ────────────────────────────────────────────────────────
-- One row per send. token + snapshot + sent_at + expires_at are FROZEN by a trigger
-- once written (the "what was sent" facts); only the tracking/response fields
-- (status, view counters, responded_at, decline_reason) may change.
CREATE TABLE IF NOT EXISTS public.quote_portal_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- quotes.id is TEXT (client-generated, 0027) — every referencing column matches
  -- it (project_quotes/projects/project_cost_centers/project_jobs; quote_audit_log
  -- was widened uuid→text in 0040). This FK MUST be text or it can't be created.
  quote_id text NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,
  token text NOT NULL UNIQUE,
  -- The client-safe projection captured at send time (line descriptions, qty,
  -- unit price, totals, tax, terms, party display names). It NEVER contains
  -- unit cost, margin, internal notes, technician names or stock refs — those are
  -- excluded when the snapshot is built, not merely hidden (SEC-1).
  snapshot jsonb NOT NULL,
  recipient_email text,
  -- status of THIS send/token: sent | viewed | accepted | declined | revoked | expired.
  -- No CHECK — states may grow (§1); the app validates transitions.
  status text NOT NULL DEFAULT 'sent',
  view_count int NOT NULL DEFAULT 0,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  responded_at timestamptz,
  decline_reason text,
  sent_by uuid,
  sent_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

-- ── quote_acceptances ─────────────────────────────────────────────────────────
-- Append-only. One response per send (UNIQUE send_id) — a second acceptance on the
-- same token is rejected by the database. record_hash is a SHA-256 tamper seal over
-- the canonical acceptance payload; signature_image holds the drawn signature (data
-- URL) when provided. Immutable via the trigger below + no UPDATE/DELETE policy.
CREATE TABLE IF NOT EXISTS public.quote_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  send_id uuid NOT NULL UNIQUE REFERENCES public.quote_portal_sends(id) ON DELETE RESTRICT,
  quote_id text NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,  -- text: matches quotes.id (0027)
  decision text NOT NULL CHECK (decision IN ('accepted','declined')),
  signer_name text,
  signer_title text,
  signer_email text,
  signature_image text,        -- drawn-signature data URL (optional)
  record_hash text,            -- SHA-256 seal over name|title|email|decision|snapshot|ts
  decline_reason text,
  ip text,
  user_agent text,
  accepted_at timestamptz NOT NULL DEFAULT now()
);

-- ── Freeze triggers ───────────────────────────────────────────────────────────
-- The send's "what was sent" columns are immutable; tracking/response columns are
-- free to change.
CREATE OR REPLACE FUNCTION public.forbid_quote_portal_send_immutable_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.snapshot   IS DISTINCT FROM OLD.snapshot
   OR NEW.token     IS DISTINCT FROM OLD.token
   OR NEW.quote_id  IS DISTINCT FROM OLD.quote_id
   OR NEW.sent_at   IS DISTINCT FROM OLD.sent_at
   OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'quote_portal_sends: snapshot/token/quote_id/sent_at/expires_at are immutable once sent';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER quote_portal_sends_freeze
  BEFORE UPDATE ON public.quote_portal_sends
  FOR EACH ROW EXECUTE FUNCTION public.forbid_quote_portal_send_immutable_change();

-- The acceptance record is fully append-only: no edits, no deletes, ever.
CREATE OR REPLACE FUNCTION public.forbid_quote_acceptance_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'quote_acceptances rows are append-only (a signed acceptance cannot be edited or deleted)';
END; $$;
CREATE TRIGGER quote_acceptances_immutable
  BEFORE UPDATE OR DELETE ON public.quote_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.forbid_quote_acceptance_mutation();

-- ── Indexes ───────────────────────────────────────────────────────────────────
-- Token lookup is the hot path on the unauthenticated portal route.
CREATE UNIQUE INDEX IF NOT EXISTS quote_portal_sends_token_idx ON public.quote_portal_sends(token);
CREATE INDEX IF NOT EXISTS quote_portal_sends_quote_idx ON public.quote_portal_sends(quote_id);
CREATE INDEX IF NOT EXISTS quote_acceptances_quote_idx ON public.quote_acceptances(quote_id);
CREATE INDEX IF NOT EXISTS quote_acceptances_send_idx ON public.quote_acceptances(send_id);

-- ── §3 boilerplate — GRANT + RLS (never anon) ─────────────────────────────────
-- authenticated may READ (operators see status + the signed record); it has NO
-- write policy, so it cannot tamper. All writes (send, view-tracking, accept,
-- decline) go through the SERVICE-ROLE client, which bypasses RLS. The freeze
-- triggers above are the hard backstop even against service-role edits.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_portal_sends TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_portal_sends TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_acceptances TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_acceptances TO service_role;

ALTER TABLE public.quote_portal_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_acceptances ENABLE ROW LEVEL SECURITY;

-- SELECT only for authenticated; no INSERT/UPDATE/DELETE policy → append/immutable
-- in the app, writes via service-role (mirrors quote_audit_log 0038).
CREATE POLICY quote_portal_sends_select_authenticated
  ON public.quote_portal_sends FOR SELECT TO authenticated USING (true);
CREATE POLICY quote_acceptances_select_authenticated
  ON public.quote_acceptances FOR SELECT TO authenticated USING (true);

COMMIT;

-- ── Existence check (after applying) ─────────────────────────────────────────
--   SELECT table_name FROM information_schema.tables WHERE table_schema='public'
--     AND table_name IN ('quote_portal_sends','quote_acceptances');  -- 2
--   SELECT tgname FROM pg_trigger WHERE tgname IN
--     ('quote_portal_sends_freeze','quote_acceptances_immutable');   -- 2
--   SELECT conname FROM pg_constraint WHERE conname IN
--     ('quote_acceptances_send_id_key','quote_portal_sends_token_key');  -- 2 (UNIQUE)
--   SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN
--     ('quote_portal_sends_token_idx','quote_portal_sends_quote_idx',
--      'quote_acceptances_quote_idx','quote_acceptances_send_idx');  -- 4
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--     WHERE table_schema='public' AND table_name='quote_portal_sends';  -- authenticated + service_role
--   SELECT policyname FROM pg_policies WHERE schemaname='public'
--     AND tablename IN ('quote_portal_sends','quote_acceptances');  -- 2 (SELECT only)
--   -- Immutability proof: UPDATE quote_acceptances SET signer_name='x'; → must RAISE.
--
-- ── Reverse migration (commented) ────────────────────────────────────────────
--   BEGIN;
--   DROP TRIGGER IF EXISTS quote_acceptances_immutable ON public.quote_acceptances;
--   DROP TRIGGER IF EXISTS quote_portal_sends_freeze ON public.quote_portal_sends;
--   DROP FUNCTION IF EXISTS public.forbid_quote_acceptance_mutation();
--   DROP FUNCTION IF EXISTS public.forbid_quote_portal_send_immutable_change();
--   DROP TABLE IF EXISTS public.quote_acceptances;
--   DROP TABLE IF EXISTS public.quote_portal_sends;
--   COMMIT;
