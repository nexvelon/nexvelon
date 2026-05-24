-- ============================================================================
-- Nexvelon · SITES-2a — Post-deploy Smoke Verification (migration 0015)
-- ============================================================================
-- Run AFTER 0015_sites_expansion.sql has been applied.
--
-- 28 column checks (existence + type + nullability + default) + 3
-- CHECK-constraint checks + 3 default-backfill checks on pre-existing
-- rows = 34 checks total.
--
-- Designed for the Supabase Dashboard SQL Editor, which only renders the
-- last query's result panel. Every check INSERTs one row into a TEMP table;
-- the single final SELECT returns one panel with all 34 checks, FAIL rows
-- ordered to the top so any regression is immediately visible.
--
-- The TEMP table drops on COMMIT so re-runs are clean. We use COMMIT (not
-- ROLLBACK) because the only state we touch is the TEMP table — no
-- mutations to public.sites.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

-- ─── COLUMN CHECKS (28) ──────────────────────────────────────────────────
-- Billing address (7)

INSERT INTO smoke_results SELECT 'billing_street column exists (text nullable)',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='billing_street' AND data_type='text' AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'billing_unit column exists (text nullable)',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='billing_unit' AND data_type='text' AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'billing_city column exists (text nullable)',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='billing_city' AND data_type='text' AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'billing_province column exists (text, default ON)',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='billing_province' AND data_type='text' AND column_default LIKE '%ON%'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'billing_postal column exists (text nullable)',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='billing_postal' AND data_type='text' AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'billing_country column exists (text, default Canada)',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='billing_country' AND data_type='text' AND column_default LIKE '%Canada%'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'billing_same_as_client boolean NOT NULL DEFAULT true',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='billing_same_as_client' AND data_type='boolean' AND is_nullable='NO'
      AND column_default LIKE '%true%'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- Mailing address (7)

INSERT INTO smoke_results SELECT 'mailing_street column exists (text nullable)',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='mailing_street' AND data_type='text' AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'mailing_unit column exists (text nullable)',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='mailing_unit' AND data_type='text' AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'mailing_city column exists (text nullable)',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='mailing_city' AND data_type='text' AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'mailing_province column exists (text, default ON)',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='mailing_province' AND data_type='text' AND column_default LIKE '%ON%'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'mailing_postal column exists (text nullable)',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='mailing_postal' AND data_type='text' AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'mailing_country column exists (text, default Canada)',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='mailing_country' AND data_type='text' AND column_default LIKE '%Canada%'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'mailing_same_as_billing boolean NOT NULL DEFAULT true',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='mailing_same_as_billing' AND data_type='boolean' AND is_nullable='NO'
      AND column_default LIKE '%true%'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- Tax (4)

INSERT INTO smoke_results SELECT 'site_hst_gst_number column exists (text nullable)',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='site_hst_gst_number' AND data_type='text' AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'tax_exempt boolean NOT NULL DEFAULT false',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='tax_exempt' AND data_type='boolean' AND is_nullable='NO'
      AND column_default LIKE '%false%'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'tax_exempt_certificate_number column exists (text nullable)',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='tax_exempt_certificate_number' AND data_type='text' AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'tax_rate numeric(5,3) nullable',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='tax_rate' AND numeric_precision = 5 AND numeric_scale = 3
      AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- Payment terms & method (7)

INSERT INTO smoke_results SELECT 'payment_terms text NOT NULL DEFAULT net_30',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='payment_terms' AND data_type='text' AND is_nullable='NO'
      AND column_default LIKE '%net_30%'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'payment_terms_custom column exists (text nullable)',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='payment_terms_custom' AND data_type='text' AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'preferred_payment_method text NOT NULL DEFAULT eft',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='preferred_payment_method' AND data_type='text' AND is_nullable='NO'
      AND column_default LIKE '%eft%'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'apply_cc_surcharge boolean NOT NULL DEFAULT true',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='apply_cc_surcharge' AND data_type='boolean' AND is_nullable='NO'
      AND column_default LIKE '%true%'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'credit_limit numeric(12,2) nullable',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='credit_limit' AND numeric_precision = 12 AND numeric_scale = 2
      AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'credit_hold boolean NOT NULL DEFAULT false',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='credit_hold' AND data_type='boolean' AND is_nullable='NO'
      AND column_default LIKE '%false%'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'preferred_currency text NOT NULL DEFAULT CAD',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='preferred_currency' AND data_type='text' AND is_nullable='NO'
      AND column_default LIKE '%CAD%'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- Portal (2)

INSERT INTO smoke_results SELECT 'portal_access_enabled boolean NOT NULL DEFAULT false',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='portal_access_enabled' AND data_type='boolean' AND is_nullable='NO'
      AND column_default LIKE '%false%'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'portal_contact_email column exists (text nullable)',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='portal_contact_email' AND data_type='text' AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- Inheritance (1)

INSERT INTO smoke_results SELECT 'inherit_payment_terms_from_client boolean NOT NULL DEFAULT true',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='inherit_payment_terms_from_client' AND data_type='boolean' AND is_nullable='NO'
      AND column_default LIKE '%true%'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── CHECK CONSTRAINT CHECKS (3) ─────────────────────────────────────────

INSERT INTO smoke_results SELECT 'payment_terms CHECK constraint exists (includes net_30)',
  CASE WHEN EXISTS (
    SELECT 1
    FROM information_schema.check_constraints cc
    JOIN information_schema.constraint_column_usage ccu
      ON cc.constraint_name = ccu.constraint_name
     AND cc.constraint_schema = ccu.constraint_schema
    WHERE ccu.table_schema='public' AND ccu.table_name='sites'
      AND ccu.column_name='payment_terms'
      AND cc.check_clause LIKE '%net_30%'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'preferred_payment_method CHECK constraint exists (includes eft)',
  CASE WHEN EXISTS (
    SELECT 1
    FROM information_schema.check_constraints cc
    JOIN information_schema.constraint_column_usage ccu
      ON cc.constraint_name = ccu.constraint_name
     AND cc.constraint_schema = ccu.constraint_schema
    WHERE ccu.table_schema='public' AND ccu.table_name='sites'
      AND ccu.column_name='preferred_payment_method'
      AND cc.check_clause LIKE '%eft%'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'preferred_currency CHECK constraint exists (includes CAD)',
  CASE WHEN EXISTS (
    SELECT 1
    FROM information_schema.check_constraints cc
    JOIN information_schema.constraint_column_usage ccu
      ON cc.constraint_name = ccu.constraint_name
     AND cc.constraint_schema = ccu.constraint_schema
    WHERE ccu.table_schema='public' AND ccu.table_name='sites'
      AND ccu.column_name='preferred_currency'
      AND cc.check_clause LIKE '%CAD%'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── EXISTING-ROW BACKFILL CHECKS (3) ────────────────────────────────────
-- Verify the NOT NULL DEFAULTs back-filled correctly on pre-migration rows.
-- All existing sites should now read TRUE for the three inheritance flags.

INSERT INTO smoke_results SELECT 'existing sites: billing_same_as_client=true (default backfilled)',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.sites
    WHERE billing_same_as_client IS NULL OR billing_same_as_client = false
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'existing sites: mailing_same_as_billing=true (default backfilled)',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.sites
    WHERE mailing_same_as_billing IS NULL OR mailing_same_as_billing = false
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'existing sites: inherit_payment_terms_from_client=true (default backfilled)',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.sites
    WHERE inherit_payment_terms_from_client IS NULL OR inherit_payment_terms_from_client = false
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── Report — FAILs first, then alphabetical by check_name ───────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
