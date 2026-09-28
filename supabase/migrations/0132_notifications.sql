-- 0132_notifications.sql
-- QUOTE-PORTAL-2 item 7 — the smallest real in-app notification store. Before this
-- there was NO notifications table (the topbar bell rendered a hardcoded empty
-- array). This adds a per-user notification row so "a quote was signed" can reach
-- the sender and every Admin. Kept generic (type/title/body/link) so later
-- features reuse it rather than inventing another store.
--
-- Each row targets ONE user (user_id). Reads are the user's own rows (RLS);
-- writes go through the service-role client (the signature happens in the
-- unauthenticated portal context). A user may mark their own rows read.

BEGIN;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,            -- e.g. 'quote_signed'. No CHECK (§1 — types grow).
  title text NOT NULL,
  body text,
  link text,                     -- in-app path to open (e.g. /quotes/<id>)
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Hot path: a user's newest unread first.
CREATE INDEX IF NOT EXISTS notifications_user_idx
  ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id) WHERE read_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- A user sees ONLY their own notifications, and may update only their own (to
-- mark read). Inserts come from the service-role client (bell events are created
-- server-side, often in the unauthenticated portal context).
CREATE POLICY notifications_select_own
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY notifications_update_own
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

COMMIT;

-- ── Existence check (after applying) ─────────────────────────────────────────
--   SELECT table_name FROM information_schema.tables WHERE table_schema='public'
--     AND table_name='notifications';                                    -- 1
--   SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='notifications'; -- 2 (+ pkey)
--   SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='notifications'; -- 2
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--     WHERE table_schema='public' AND table_name='notifications';        -- authenticated + service_role
--
-- ── Reverse migration (commented) ────────────────────────────────────────────
--   BEGIN; DROP TABLE IF EXISTS public.notifications; COMMIT;
