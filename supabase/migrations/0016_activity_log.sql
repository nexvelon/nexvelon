-- 0016_activity_log.sql
-- ACT-1: append-only activity log for clients / sites / contacts.
--
-- Mirrors public.auth_audit_log (migration 0002) — append-only, RLS-gated
-- SELECT, no INSERT/UPDATE/DELETE policies (writes via server actions
-- only). Differs from auth_audit_log on visibility: authenticated SELECT
-- here (operators need to see "who edited this client" on detail pages)
-- vs Admin-only on auth_audit_log.
--
-- entity_id has NO foreign key — entity_type tells you which table, and
-- FK cascades would delete log rows when the entity is deleted, which
-- defeats the audit purpose. actor_id uses ON DELETE SET NULL so log
-- rows survive a user-account removal too (UI renders "Unknown user").
--
-- changes is a jsonb OBJECT (not array) — CHECK enforces shape so we
-- don't accidentally write arrays that would break the diff UI.
--
-- Quotes deferred until Quotes v1 (NEXVELON_ROADMAP item 4) lands a
-- DB-backed quotes table. Today quotes persist to localStorage so
-- there's no server mutation to log. Add 'quote' to the entity_type
-- CHECK via an additive migration when that ships.

BEGIN;

CREATE TABLE public.activity_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  text NOT NULL
                 CHECK (entity_type IN ('client', 'site', 'contact')),
  entity_id    uuid NOT NULL,
  action       text NOT NULL
                 CHECK (action IN ('create', 'update', 'delete')),
  changes      jsonb NOT NULL DEFAULT '{}'::jsonb
                 CHECK (jsonb_typeof(changes) = 'object'),
  actor_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.activity_log IS
  'ACT-1 · append-only activity log for clients / sites / contacts. Quotes deferred until Quotes v1 lands a DB-backed table. Inserts via server actions; no UPDATE/DELETE policies.';

-- Primary read path: "show me all activity for THIS entity, newest first".
CREATE INDEX activity_log_entity_idx ON public.activity_log
  (entity_type, entity_id, created_at DESC);

-- Future read path: "show me everything THIS user did, newest first".
CREATE INDEX activity_log_actor_idx ON public.activity_log
  (actor_id, created_at DESC);

-- ─── RLS — authenticated SELECT; writes via server actions only ───
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_log_select_authenticated"
  ON public.activity_log FOR SELECT TO authenticated USING (true);

-- No INSERT/UPDATE/DELETE policies → only the service-role (server
-- actions) can write. Append-only by convention.

COMMIT;
