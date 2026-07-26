-- ============================================================================
-- SMOKE · 0114 · role_permission_matrix
-- ============================================================================
-- Verifies the lean matrix table + §3 + the seed, then rolls back via a raised
-- exception so nothing persists. Run AFTER 0114 is applied.
--
--   · table exists, PK prevents duplicate triples
--   · seed row count == 194 (the granted-triple count from ROLE_PERMISSIONS)
--   · spot-checks: Admin has financials:view; Technician does NOT have
--     financials:view; ViewOnly has dashboard:view; and "absent = denied"
--     (Technician financials:view row is genuinely absent)
-- ============================================================================

DO $$
DECLARE
  v_count integer;
  v_admin_fin_view integer;
  v_tech_fin_view integer;
  v_viewonly_dash_view integer;
  v_dupe_blocked boolean := false;
BEGIN
  -- 1. Seed row count == 194.
  SELECT count(*) INTO v_count FROM public.role_permission_matrix;
  IF v_count <> 194 THEN
    RAISE EXCEPTION 'smoke 0114: expected 194 seeded rows, got %', v_count;
  END IF;

  -- 2. Spot-checks (present = granted).
  SELECT count(*) INTO v_admin_fin_view FROM public.role_permission_matrix
    WHERE role = 'Admin' AND resource = 'financials' AND action = 'view';
  IF v_admin_fin_view <> 1 THEN
    RAISE EXCEPTION 'smoke 0114: Admin financials:view should be granted (found %)', v_admin_fin_view;
  END IF;

  SELECT count(*) INTO v_viewonly_dash_view FROM public.role_permission_matrix
    WHERE role = 'ViewOnly' AND resource = 'dashboard' AND action = 'view';
  IF v_viewonly_dash_view <> 1 THEN
    RAISE EXCEPTION 'smoke 0114: ViewOnly dashboard:view should be granted (found %)', v_viewonly_dash_view;
  END IF;

  -- 3. Absent = denied: Technician has NO financials:view row.
  SELECT count(*) INTO v_tech_fin_view FROM public.role_permission_matrix
    WHERE role = 'Technician' AND resource = 'financials' AND action = 'view';
  IF v_tech_fin_view <> 0 THEN
    RAISE EXCEPTION 'smoke 0114: Technician financials:view should be ABSENT (found %)', v_tech_fin_view;
  END IF;

  -- 4. PK blocks duplicate triples.
  BEGIN
    INSERT INTO public.role_permission_matrix (role, resource, action)
      VALUES ('Admin', 'financials', 'view');
    RAISE EXCEPTION 'smoke 0114: duplicate (Admin,financials,view) should have been blocked by PK';
  EXCEPTION
    WHEN unique_violation THEN
      v_dupe_blocked := true;
  END;
  IF NOT v_dupe_blocked THEN
    RAISE EXCEPTION 'smoke 0114: PK duplicate-block check did not run';
  END IF;

  RAISE NOTICE 'smoke 0114 PASSED: 194 rows, spot-checks ok, absent=denied, PK enforced';
  RAISE EXCEPTION 'smoke 0114 rollback (intentional — no persistence)';
END $$;
