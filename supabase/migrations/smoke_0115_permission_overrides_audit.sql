-- ============================================================================
-- SMOKE · 0115 · user_permission_overrides + permission_audit
-- ============================================================================
-- Verifies both tables, the state/change_type CHECKs, the active-unique index,
-- and permission_audit's append-only trigger. Rolls back via a raised exception
-- so nothing persists. Uses a throwaway auth.users row (also rolled back).
-- ============================================================================

DO $$
DECLARE
  v_user   uuid;
  v_actor  uuid;
  v_ovr    uuid;
  v_audit  uuid;
  v_blocked boolean;
BEGIN
  -- Fixture users (rolled back with everything else).
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'smoke0115-a@example.com')
    RETURNING id INTO v_user;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'smoke0115-b@example.com')
    RETURNING id INTO v_actor;

  -- 1. Insert a granted override.
  INSERT INTO public.user_permission_overrides (user_id, resource, action, state, created_by)
    VALUES (v_user, 'financials', 'edit', 'granted', v_actor)
    RETURNING id INTO v_ovr;

  -- 2. state CHECK rejects a bad value.
  v_blocked := false;
  BEGIN
    INSERT INTO public.user_permission_overrides (user_id, resource, action, state)
      VALUES (v_user, 'financials', 'view', 'maybe');
  EXCEPTION WHEN check_violation THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'smoke 0115: state CHECK not enforced'; END IF;

  -- 3. active-unique: a SECOND active override for the same triple is rejected.
  v_blocked := false;
  BEGIN
    INSERT INTO public.user_permission_overrides (user_id, resource, action, state)
      VALUES (v_user, 'financials', 'edit', 'denied');
  EXCEPTION WHEN unique_violation THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'smoke 0115: active-unique index not enforced'; END IF;

  -- 4. …but after revoking the first, a new active one is allowed.
  UPDATE public.user_permission_overrides SET revoked_at = now(), revoked_by = v_actor WHERE id = v_ovr;
  INSERT INTO public.user_permission_overrides (user_id, resource, action, state)
    VALUES (v_user, 'financials', 'edit', 'denied');

  -- 5. permission_audit: insert ok; change_type CHECK enforced.
  INSERT INTO public.permission_audit (actor_user_id, target_user_id, resource, action, change_type, new_state)
    VALUES (v_actor, v_user, 'financials', 'edit', 'grant', 'granted')
    RETURNING id INTO v_audit;
  v_blocked := false;
  BEGIN
    INSERT INTO public.permission_audit (target_user_id, change_type) VALUES (v_user, 'nonsense');
  EXCEPTION WHEN check_violation THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'smoke 0115: change_type CHECK not enforced'; END IF;

  -- 6. append-only: UPDATE blocked.
  v_blocked := false;
  BEGIN
    UPDATE public.permission_audit SET reason = 'tamper' WHERE id = v_audit;
  EXCEPTION WHEN others THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'smoke 0115: permission_audit UPDATE should be blocked'; END IF;

  -- 7. append-only: DELETE blocked.
  v_blocked := false;
  BEGIN
    DELETE FROM public.permission_audit WHERE id = v_audit;
  EXCEPTION WHEN others THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'smoke 0115: permission_audit DELETE should be blocked'; END IF;

  RAISE NOTICE 'smoke 0115 PASSED: overrides CHECK/active-unique/revoke-reinsert + audit append-only';
  RAISE EXCEPTION 'smoke 0115 rollback (intentional — no persistence)';
END $$;
