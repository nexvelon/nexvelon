-- ============================================================================
-- Nexvelon · 0115 · Permissions runtime (PERM-3) — per-user overrides + audit
-- ============================================================================
-- Two tables on top of the PERM-1/2 role matrix:
--
--   1. user_permission_overrides — bidirectional per-user override of a matrix
--      (resource, action). state='granted' ADDS a permission the role lacks;
--      state='denied' REMOVES one the role has. The resolver applies
--      deny > grant > role-default (lib/permissions/resolve.ts). Soft-revoke via
--      revoked_at keeps the history. At most ONE active row per
--      (user, resource, action).
--
--   2. permission_audit — APPEND-ONLY ledger of every override change
--      (grant/deny/revoke) and future role changes. Immutable: a BEFORE
--      UPDATE/DELETE trigger blocks mutation (mirrors schedule_audit / 0113).
--
-- The existing allow-only user_grants (0029) is UNTOUCHED — its one key
-- (quotes.edit_discount) is a bespoke client feature-flag, not a matrix
-- (resource, action), so it is NOT folded/backfilled here; it keeps serving
-- TotalsBar via the client grants set. Overrides are the general matrix
-- mechanism; the two coexist.
--
-- Production safety: single BEGIN..COMMIT (atomic); additive only; no existing
-- table altered. Rollback: DROP the trigger, function, and both tables.
-- ============================================================================

BEGIN;

-- ── 1. user_permission_overrides ────────────────────────────────────────────
CREATE TABLE public.user_permission_overrides (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource    text NOT NULL,
  action      text NOT NULL,
  state       text NOT NULL CHECK (state IN ('granted', 'denied')),
  reason      text,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz,
  revoked_by  uuid REFERENCES auth.users(id)
);

-- At most one ACTIVE override per (user, resource, action). A revoked row drops
-- out of the predicate, so the same triple can be re-granted after revocation.
CREATE UNIQUE INDEX user_permission_overrides_active_unique
  ON public.user_permission_overrides (user_id, resource, action)
  WHERE revoked_at IS NULL;
CREATE INDEX user_permission_overrides_user_idx
  ON public.user_permission_overrides (user_id) WHERE revoked_at IS NULL;

-- §3: authenticated may read (the resolver reads the current user's overrides;
-- the admin UI reads others') and write (writes are gated to Admin at the
-- action layer — same model as user_grants/0029). service_role full.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permission_overrides TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permission_overrides TO service_role;

ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_permission_overrides_select_authenticated
  ON public.user_permission_overrides FOR SELECT TO authenticated USING (true);
CREATE POLICY user_permission_overrides_write_authenticated
  ON public.user_permission_overrides FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 2. permission_audit (append-only) ───────────────────────────────────────
CREATE TABLE public.permission_audit (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id  uuid REFERENCES auth.users(id),
  target_user_id uuid REFERENCES auth.users(id),  -- whose permission changed
  target_role    text,                            -- for role-level changes (future)
  resource       text,
  action         text,
  change_type    text NOT NULL CHECK (change_type IN ('grant', 'deny', 'revoke', 'role_change')),
  old_state      text,
  new_state      text,
  reason         text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX permission_audit_target_idx ON public.permission_audit (target_user_id);
CREATE INDEX permission_audit_created_idx ON public.permission_audit (created_at);

-- §3: append-only → GRANT SELECT + INSERT to authenticated (no UPDATE/DELETE),
-- full to service_role. RLS select + insert policies only; the absence of an
-- update/delete policy AND the trigger below make the log immutable.
GRANT SELECT, INSERT ON public.permission_audit TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.permission_audit TO service_role;

ALTER TABLE public.permission_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY permission_audit_select_authenticated
  ON public.permission_audit FOR SELECT TO authenticated USING (true);
CREATE POLICY permission_audit_insert_authenticated
  ON public.permission_audit FOR INSERT TO authenticated WITH CHECK (true);

-- Immutability trigger — blocks UPDATE and DELETE for every caller (incl.
-- service_role), so the ledger can only ever be appended to.
CREATE OR REPLACE FUNCTION public.block_permission_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'permission_audit is append-only (no % allowed)', TG_OP;
END;
$$;

CREATE TRIGGER permission_audit_no_update_delete
  BEFORE UPDATE OR DELETE ON public.permission_audit
  FOR EACH ROW EXECUTE FUNCTION public.block_permission_audit_mutation();

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (the exact reverse):
--   BEGIN;
--   DROP TRIGGER IF EXISTS permission_audit_no_update_delete ON public.permission_audit;
--   DROP FUNCTION IF EXISTS public.block_permission_audit_mutation();
--   DROP TABLE IF EXISTS public.permission_audit;
--   DROP TABLE IF EXISTS public.user_permission_overrides;
--   COMMIT;
-- ============================================================================
