-- ============================================================================
-- Nexvelon · CL-11 — Post-deploy Smoke Verification (migration 0018)
-- ============================================================================
-- Run AFTER 0018_payment_method_cash.sql has been applied.
--
-- 6 checks total: 2 positive (cash accepted on clients + sites) + 2
-- preservation (cheque still accepted on both) + 2 negative (invalid
-- value rejected on both).
--
-- The smoke creates temp rows to exercise the CHECK; everything rolls
-- back at the end so the table state is unchanged. FAILs-first
-- ordering surfaces any regression at the top of the result panel.
--
-- Note on schema: clients only requires `name` (everything else has a
-- column default, including default_opco='integrated_solutions',
-- allowed_opcos='{integrated_solutions}', status='Prospect',
-- preferred_payment_method='eft'). Sites only require client_id + name.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

-- ─── Setup: insert one temp client + one temp site we'll exercise ─────────

INSERT INTO public.clients (name, legal_name, preferred_payment_method)
VALUES ('SMOKE_TEST_CL11', 'SMOKE_TEST_CL11', 'cash');

INSERT INTO public.sites (client_id, name, preferred_payment_method)
SELECT id, 'SMOKE_TEST_SITE_CL11', 'cash'
FROM public.clients WHERE name='SMOKE_TEST_CL11';

-- ─── POSITIVE (2): 'cash' accepted ────────────────────────────────────────

INSERT INTO smoke_results SELECT 'clients accepts cash',
  CASE WHEN EXISTS (
    SELECT 1 FROM public.clients
    WHERE name='SMOKE_TEST_CL11' AND preferred_payment_method='cash'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'sites accepts cash',
  CASE WHEN EXISTS (
    SELECT 1 FROM public.sites
    WHERE name='SMOKE_TEST_SITE_CL11' AND preferred_payment_method='cash'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── PRESERVATION (2): 'cheque' still accepted (§2.1) ─────────────────────

INSERT INTO smoke_results VALUES
  ('clients still accepts cheque (preservation)', 'FAIL');
DO $$
BEGIN
  UPDATE public.clients SET preferred_payment_method = 'cheque'
    WHERE name = 'SMOKE_TEST_CL11';
  UPDATE smoke_results SET status = 'PASS'
    WHERE check_name = 'clients still accepts cheque (preservation)';
EXCEPTION
  WHEN check_violation THEN NULL;  -- leave FAIL
END $$;

INSERT INTO smoke_results VALUES
  ('sites still accepts cheque (preservation)', 'FAIL');
DO $$
BEGIN
  UPDATE public.sites SET preferred_payment_method = 'cheque'
    WHERE name = 'SMOKE_TEST_SITE_CL11';
  UPDATE smoke_results SET status = 'PASS'
    WHERE check_name = 'sites still accepts cheque (preservation)';
EXCEPTION
  WHEN check_violation THEN NULL;
END $$;

-- ─── NEGATIVE (2): invalid value rejected ─────────────────────────────────

INSERT INTO smoke_results VALUES
  ('clients rejects invalid value (negative)', 'FAIL');
DO $$
BEGIN
  UPDATE public.clients SET preferred_payment_method = 'bitcoin'
    WHERE name = 'SMOKE_TEST_CL11';
  -- If the UPDATE succeeds, the CHECK is broken — leave FAIL.
EXCEPTION
  WHEN check_violation THEN
    UPDATE smoke_results SET status = 'PASS'
      WHERE check_name = 'clients rejects invalid value (negative)';
END $$;

INSERT INTO smoke_results VALUES
  ('sites rejects invalid value (negative)', 'FAIL');
DO $$
BEGIN
  UPDATE public.sites SET preferred_payment_method = 'bitcoin'
    WHERE name = 'SMOKE_TEST_SITE_CL11';
EXCEPTION
  WHEN check_violation THEN
    UPDATE smoke_results SET status = 'PASS'
      WHERE check_name = 'sites rejects invalid value (negative)';
END $$;

-- ─── Report — FAILs first, then alphabetical by check_name ────────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

-- ROLLBACK so the temp client + site disappear and the table state is
-- exactly what it was before the smoke ran.
ROLLBACK;
