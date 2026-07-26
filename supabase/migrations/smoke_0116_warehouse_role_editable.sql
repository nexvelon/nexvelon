-- ============================================================================
-- SMOKE · 0116 · Warehouse baseline + widened permission_audit CHECK
-- ============================================================================
-- Verifies the Warehouse seed (12 rows; inventory:edit granted, financials:edit
-- absent = denied) and that permission_audit now accepts the role-baseline
-- change_type values. Rolls back the audit insert via a raised exception; the
-- seeded Warehouse rows are already committed by 0116 (this only reads them).
-- ============================================================================

DO $$
DECLARE
  v_count int;
  v_inv_edit int;
  v_fin_edit int;
  v_blocked boolean;
BEGIN
  -- Warehouse baseline present (12 rows).
  SELECT count(*) INTO v_count FROM public.role_permission_matrix WHERE role = 'Warehouse';
  IF v_count <> 12 THEN
    RAISE EXCEPTION 'smoke 0116: expected 12 Warehouse rows, got %', v_count;
  END IF;

  -- Warehouse CAN inventory:edit …
  SELECT count(*) INTO v_inv_edit FROM public.role_permission_matrix
    WHERE role = 'Warehouse' AND resource = 'inventory' AND action = 'edit';
  IF v_inv_edit <> 1 THEN
    RAISE EXCEPTION 'smoke 0116: Warehouse inventory:edit should be granted (found %)', v_inv_edit;
  END IF;

  -- … but NOT financials:edit (absent = denied).
  SELECT count(*) INTO v_fin_edit FROM public.role_permission_matrix
    WHERE role = 'Warehouse' AND resource = 'financials' AND action = 'edit';
  IF v_fin_edit <> 0 THEN
    RAISE EXCEPTION 'smoke 0116: Warehouse financials:edit should be ABSENT (found %)', v_fin_edit;
  END IF;

  -- permission_audit accepts the new role-baseline change_type.
  INSERT INTO public.permission_audit (target_role, resource, action, change_type, new_state)
    VALUES ('Warehouse', 'inventory', 'edit', 'role_baseline_grant', 'granted');
  INSERT INTO public.permission_audit (target_role, resource, action, change_type, old_state)
    VALUES ('Warehouse', 'inventory', 'edit', 'role_baseline_revoke', 'granted');

  -- … and still rejects a bogus one.
  v_blocked := false;
  BEGIN
    INSERT INTO public.permission_audit (target_role, change_type) VALUES ('Warehouse', 'nope');
  EXCEPTION WHEN check_violation THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'smoke 0116: change_type CHECK not enforced'; END IF;

  RAISE NOTICE 'smoke 0116 PASSED: Warehouse baseline (12) + inventory:edit + widened audit CHECK';
  RAISE EXCEPTION 'smoke 0116 rollback (intentional — undo the audit inserts)';
END $$;
