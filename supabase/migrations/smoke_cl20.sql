-- ============================================================================
-- Nexvelon · CL-20 — Post-deploy Smoke Verification (migration 0020)
-- ============================================================================
-- Run AFTER 0020_currency_expansion.sql has been applied.
--
-- 8 checks: 3 positive (AED + INR + EUR accepted on clients) + 2
-- preservation (CAD + USD still accepted) + 1 site positive +
-- 2 negative (invalid currency rejected on both tables).
--
-- Smoke creates one temp client + one temp site; ROLLBACK at the end
-- so the table state is unchanged. FAILs-first ordering surfaces any
-- regression at the top of the result panel.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

-- ─── Setup: temp client with AED + temp site with EUR ────────────────────

INSERT INTO public.clients (name, legal_name, preferred_currency)
VALUES ('SMOKE_TEST_CL20', 'SMOKE_TEST_CL20', 'AED');

INSERT INTO public.sites (client_id, name, preferred_currency)
SELECT id, 'SMOKE_TEST_SITE_CL20', 'EUR'
FROM public.clients WHERE name = 'SMOKE_TEST_CL20';

-- ─── POSITIVE (3): new currencies accepted on clients ───────────────────

INSERT INTO smoke_results SELECT 'clients accepts AED',
  CASE WHEN EXISTS (
    SELECT 1 FROM public.clients
    WHERE name = 'SMOKE_TEST_CL20' AND preferred_currency = 'AED'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results VALUES ('clients accepts INR', 'FAIL');
DO $$
BEGIN
  UPDATE public.clients SET preferred_currency = 'INR'
    WHERE name = 'SMOKE_TEST_CL20';
  UPDATE smoke_results SET status = 'PASS'
    WHERE check_name = 'clients accepts INR';
EXCEPTION
  WHEN check_violation THEN NULL;
END $$;

INSERT INTO smoke_results VALUES ('clients accepts EUR', 'FAIL');
DO $$
BEGIN
  UPDATE public.clients SET preferred_currency = 'EUR'
    WHERE name = 'SMOKE_TEST_CL20';
  UPDATE smoke_results SET status = 'PASS'
    WHERE check_name = 'clients accepts EUR';
EXCEPTION
  WHEN check_violation THEN NULL;
END $$;

-- ─── PRESERVATION (2): CAD + USD still accepted ─────────────────────────

INSERT INTO smoke_results VALUES
  ('clients still accepts CAD (preservation)', 'FAIL');
DO $$
BEGIN
  UPDATE public.clients SET preferred_currency = 'CAD'
    WHERE name = 'SMOKE_TEST_CL20';
  UPDATE smoke_results SET status = 'PASS'
    WHERE check_name = 'clients still accepts CAD (preservation)';
EXCEPTION
  WHEN check_violation THEN NULL;
END $$;

INSERT INTO smoke_results VALUES
  ('clients still accepts USD (preservation)', 'FAIL');
DO $$
BEGIN
  UPDATE public.clients SET preferred_currency = 'USD'
    WHERE name = 'SMOKE_TEST_CL20';
  UPDATE smoke_results SET status = 'PASS'
    WHERE check_name = 'clients still accepts USD (preservation)';
EXCEPTION
  WHEN check_violation THEN NULL;
END $$;

-- ─── SITE POSITIVE (1): EUR accepted on sites ───────────────────────────

INSERT INTO smoke_results SELECT 'sites accepts EUR',
  CASE WHEN EXISTS (
    SELECT 1 FROM public.sites
    WHERE name = 'SMOKE_TEST_SITE_CL20' AND preferred_currency = 'EUR'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── NEGATIVE (2): invalid currency rejected on both tables ─────────────

INSERT INTO smoke_results VALUES
  ('clients rejects invalid currency', 'FAIL');
DO $$
BEGIN
  UPDATE public.clients SET preferred_currency = 'GBP'
    WHERE name = 'SMOKE_TEST_CL20';
EXCEPTION
  WHEN check_violation THEN
    UPDATE smoke_results SET status = 'PASS'
      WHERE check_name = 'clients rejects invalid currency';
END $$;

INSERT INTO smoke_results VALUES
  ('sites rejects invalid currency', 'FAIL');
DO $$
BEGIN
  UPDATE public.sites SET preferred_currency = 'GBP'
    WHERE name = 'SMOKE_TEST_SITE_CL20';
EXCEPTION
  WHEN check_violation THEN
    UPDATE smoke_results SET status = 'PASS'
      WHERE check_name = 'sites rejects invalid currency';
END $$;

-- ─── Report — FAILs first ───────────────────────────────────────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

ROLLBACK;
