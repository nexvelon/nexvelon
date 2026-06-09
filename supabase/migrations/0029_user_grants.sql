-- 0029_user_grants.sql
-- Chunk 3c: additive per-user grant layer. A grant is an ALLOW-only overlay on
-- top of the role-based permission system (lib/permissions.ts) — it never
-- removes a role's abilities, only unlocks an extra capability for a specific
-- user. First grant_key is 'quotes.edit_discount' (discount editing is
-- Admin-only by default; this grant unlocks it for a chosen non-Admin).
--
-- One row per (user, grant). user_id FKs auth.users (= profiles.id), cascade on
-- delete. RLS authenticated read + write; writes additionally requireAdmin at
-- the server-action layer. No seed — grants start empty.

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_grants (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grant_key   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id),
  PRIMARY KEY (user_id, grant_key)
);

CREATE INDEX IF NOT EXISTS user_grants_user_idx ON public.user_grants (user_id);

ALTER TABLE public.user_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_grants_select_authenticated" ON public.user_grants
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_grants_write_authenticated" ON public.user_grants
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
