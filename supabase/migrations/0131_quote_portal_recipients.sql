-- 0131_quote_portal_recipients.sql
-- QUOTE-PORTAL-2 — multi-recipient sends (To/Cc), two delivery modes, per-recipient
-- signing links, and an owner-authorised hard delete of an acceptance.
--
-- Model: a "send" (quote_portal_sends, 0129) still holds the ONE immutable snapshot
-- + delivery mode + expiry. Each recipient of that send is a row in
-- quote_portal_recipients. Only 'to' recipients get a token (the /q/<token> signing
-- link); 'cc' recipients have token NULL — the "a Cc can never receive or use a
-- signing link" rule is enforced by a CHECK, not merely the UI. One accepted 'to'
-- recipient supersedes the other 'to' links (read-only), and UNIQUE(send_id) on
-- quote_acceptances (0129) still guarantees exactly one acceptance per send.

BEGIN;

-- ── delivery mode on the send ──────────────────────────────────────────────────
--   'link'       — the signing link goes ONLY to To.
--   'attachment' — the full PDF goes to To + Cc; the signing link goes to To only.
-- No CHECK (§1 — modes may grow); the app validates.
ALTER TABLE public.quote_portal_sends
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'link';

-- The send-level token is legacy (QUOTE-PORTAL-1: one link per send). QUOTE-PORTAL-2
-- puts the link on each 'to' recipient, so new sends leave this NULL. Existing
-- rows keep their token; the portal resolves recipient tokens first, then this.
ALTER TABLE public.quote_portal_sends
  ALTER COLUMN token DROP NOT NULL;

-- The unsigned PDF as sent (stored in the quote's "Proposals" folder). The portal
-- serves THIS file, so the client sees exactly what was sent.
ALTER TABLE public.quote_portal_sends
  ADD COLUMN IF NOT EXISTS proposal_pdf_path text;

-- The SEC-1-safe QuoteDocument render payload captured at send time, so the
-- countersigned PDF is the exact document that was sent + a signature page — never
-- a re-render of a since-edited live quote.
ALTER TABLE public.quote_portal_sends
  ADD COLUMN IF NOT EXISTS render_payload jsonb;

-- ── quote_portal_recipients ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quote_portal_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  send_id uuid NOT NULL REFERENCES public.quote_portal_sends(id) ON DELETE CASCADE,
  -- quotes.id is TEXT (0027); every referencing column matches it (0040/0129).
  quote_id text NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('to','cc')),
  name text,
  email text NOT NULL,
  -- where the recipient came from: client_contact | site_contact | employee | manual.
  -- No CHECK (§1 — sources may grow).
  source text,
  -- The signing-link token. NON-NULL only for 'to' recipients; a 'cc' row can never
  -- carry a token — enforced here so a Cc can never receive or use a signing link.
  token text UNIQUE,
  status text NOT NULL DEFAULT 'sent', -- sent|viewed|accepted|declined|revoked|expired|superseded
  view_count int NOT NULL DEFAULT 0,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_portal_recipients_cc_no_token CHECK (role = 'to' OR token IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS quote_portal_recipients_token_idx
  ON public.quote_portal_recipients(token) WHERE token IS NOT NULL;
CREATE INDEX IF NOT EXISTS quote_portal_recipients_send_idx
  ON public.quote_portal_recipients(send_id);
CREATE INDEX IF NOT EXISTS quote_portal_recipients_quote_idx
  ON public.quote_portal_recipients(quote_id);

-- ── acceptance → which recipient signed + the countersigned PDF ────────────────
ALTER TABLE public.quote_acceptances
  ADD COLUMN IF NOT EXISTS recipient_id uuid
    REFERENCES public.quote_portal_recipients(id) ON DELETE SET NULL;
-- The countersigned PDF (stored in the quote's "Signed" folder).
ALTER TABLE public.quote_acceptances
  ADD COLUMN IF NOT EXISTS signed_pdf_path text;

-- ── Admin hard-delete exception (item 10; deliberate owner override of §2.2) ────
-- 0129 made quote_acceptances append-only via a BEFORE UPDATE OR DELETE trigger.
-- The owner has authorised a hard delete of an acceptance (Admin-only, confirmed,
-- and itself audited to quote_audit_log so the FACT of removal persists). We keep
-- the append-only guarantee for EDITS (no UPDATE) but now permit DELETE, which the
-- app gates to Admin + logs. Service-role performs the delete.
CREATE OR REPLACE FUNCTION public.forbid_quote_acceptance_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'quote_acceptances rows cannot be edited (append-only). Deletion is Admin-only via the app and is audited.';
END; $$;
DROP TRIGGER IF EXISTS quote_acceptances_immutable ON public.quote_acceptances;
CREATE TRIGGER quote_acceptances_no_update
  BEFORE UPDATE ON public.quote_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.forbid_quote_acceptance_mutation();

-- ── §3 boilerplate — GRANT + RLS (never anon) ─────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_portal_recipients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_portal_recipients TO service_role;

ALTER TABLE public.quote_portal_recipients ENABLE ROW LEVEL SECURITY;

-- SELECT only for authenticated (operators view recipients + status); all writes
-- go through the service-role client (mirrors quote_portal_sends 0129).
CREATE POLICY quote_portal_recipients_select_authenticated
  ON public.quote_portal_recipients FOR SELECT TO authenticated USING (true);

COMMIT;

-- ── Existence check (after applying) ─────────────────────────────────────────
--   SELECT column_name FROM information_schema.columns WHERE table_schema='public'
--     AND table_name='quote_portal_sends' AND column_name='delivery_mode';        -- 1
--   SELECT is_nullable FROM information_schema.columns WHERE table_schema='public'
--     AND table_name='quote_portal_sends' AND column_name='token';                -- YES
--   SELECT table_name FROM information_schema.tables WHERE table_schema='public'
--     AND table_name='quote_portal_recipients';                                   -- 1
--   SELECT column_name FROM information_schema.columns WHERE table_schema='public'
--     AND table_name='quote_acceptances' AND column_name='recipient_id';          -- 1
--   SELECT conname FROM pg_constraint WHERE conname IN
--     ('quote_portal_recipients_role_check','quote_portal_recipients_cc_no_token');-- 2
--   SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='quote_portal_recipients'; -- 3 (+ pkey)
--   SELECT tgname FROM pg_trigger WHERE tgname='quote_acceptances_no_update';      -- 1
--   SELECT tgname FROM pg_trigger WHERE tgname='quote_acceptances_immutable';      -- 0 (dropped)
--   SELECT policyname FROM pg_policies WHERE schemaname='public'
--     AND tablename='quote_portal_recipients';                                    -- 1 (SELECT)
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--     WHERE table_schema='public' AND table_name='quote_portal_recipients';       -- authenticated + service_role
--   -- cc-no-token proof: INSERT ... (role='cc', token='x') → must FAIL the CHECK.
--   -- delete-allowed proof: DELETE FROM quote_acceptances WHERE id='…'; → succeeds (was blocked pre-0131).
--
-- ── Reverse migration (commented) ────────────────────────────────────────────
--   BEGIN;
--   CREATE OR REPLACE FUNCTION public.forbid_quote_acceptance_mutation()
--   RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
--     RAISE EXCEPTION 'quote_acceptances rows are append-only'; END; $$;
--   DROP TRIGGER IF EXISTS quote_acceptances_no_update ON public.quote_acceptances;
--   CREATE TRIGGER quote_acceptances_immutable BEFORE UPDATE OR DELETE
--     ON public.quote_acceptances FOR EACH ROW
--     EXECUTE FUNCTION public.forbid_quote_acceptance_mutation();
--   ALTER TABLE public.quote_acceptances DROP COLUMN IF EXISTS recipient_id;
--   DROP TABLE IF EXISTS public.quote_portal_recipients;
--   ALTER TABLE public.quote_portal_sends DROP COLUMN IF EXISTS delivery_mode;
--   -- (token stays nullable; re-adding NOT NULL would require backfilling.)
--   COMMIT;
