-- ============================================================================
-- Nexvelon · SITE-FIELDS — Post-deploy Smoke Verification (migration 0037)
-- ============================================================================
-- Run AFTER 0037_sites_status_in_quote.sql has been applied.
--
-- Verifies the widened sites.status CHECK lists all five values (incl. the new
-- 'In Quote') and that a real site UPDATE to 'In Quote' is accepted by the
-- constraint. The UPDATE is a round-trip → ROLLBACK (nothing is persisted).
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

-- 1 — CHECK definition lists all five status values, including 'In Quote'.
INSERT INTO smoke_results SELECT 'sites status CHECK lists all 5 values incl In Quote',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.sites'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%In Quote%'
      AND pg_get_constraintdef(oid) ILIKE '%Active%'
      AND pg_get_constraintdef(oid) ILIKE '%In Project%'
      AND pg_get_constraintdef(oid) ILIKE '%Maintained%'
      AND pg_get_constraintdef(oid) ILIKE '%Decommissioned%'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- 2 — A site UPDATE to 'In Quote' is accepted by the CHECK (round-trip).
DO $$
DECLARE sid public.sites.id%TYPE;
BEGIN
  SELECT id INTO sid FROM public.sites LIMIT 1;
  IF sid IS NULL THEN
    INSERT INTO smoke_results VALUES ('UPDATE site status -> In Quote succeeds', 'SKIP (no sites)');
  ELSE
    BEGIN
      UPDATE public.sites SET status = 'In Quote' WHERE id = sid;
      INSERT INTO smoke_results VALUES ('UPDATE site status -> In Quote succeeds', 'PASS');
    EXCEPTION WHEN check_violation THEN
      INSERT INTO smoke_results VALUES ('UPDATE site status -> In Quote succeeds', 'FAIL');
    END;
  END IF;
END $$;

-- ─── Report — FAILs/SKIPs first, then alphabetical by check_name ──────────
SELECT * FROM smoke_results ORDER BY (status LIKE 'PASS%'), check_name;

-- Round-trip write above is discarded.
ROLLBACK;
