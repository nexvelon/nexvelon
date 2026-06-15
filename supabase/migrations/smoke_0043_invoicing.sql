-- ============================================================================
-- Nexvelon · INVOICE-1 — Post-deploy Smoke Verification (migration 0043)
-- ============================================================================
-- Run AFTER 0043_invoicing.sql has been applied. Pure-read → COMMIT.
-- Verifies: project_cost_centers.contract_value (numeric); invoice_counters +
-- the next_invoice_seq function; invoices + invoice_lines with their columns
-- and FK types (project_id/client_id/site_id = uuid, invoice_number
-- nullable + UNIQUE); RLS on all three new tables; the policies by name; the
-- indexes by name.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

-- ─── contract_value on project_cost_centers ──────────────────────────────
INSERT INTO smoke_results SELECT 'project_cost_centers.contract_value is numeric',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='project_cost_centers'
      AND column_name='contract_value' AND data_type='numeric')
  THEN 'PASS' ELSE 'FAIL' END;

-- ─── Tables exist ────────────────────────────────────────────────────────
INSERT INTO smoke_results
SELECT 'table ' || t || ' exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name=t
  ) THEN 'PASS' ELSE 'FAIL' END
FROM unnest(ARRAY['invoice_counters','invoices','invoice_lines']) AS t;

-- ─── next_invoice_seq function exists ────────────────────────────────────
INSERT INTO smoke_results SELECT 'function next_invoice_seq exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='next_invoice_seq')
  THEN 'PASS' ELSE 'FAIL' END;

-- ─── invoice_counters columns ────────────────────────────────────────────
INSERT INTO smoke_results SELECT 'invoice_counters.opco is text PK',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='invoice_counters'
      AND column_name='opco' AND data_type='text')
  THEN 'PASS' ELSE 'FAIL' END;
INSERT INTO smoke_results SELECT 'invoice_counters.last_seq is integer',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='invoice_counters'
      AND column_name='last_seq' AND data_type='integer')
  THEN 'PASS' ELSE 'FAIL' END;

-- ─── invoices key columns + FK types ─────────────────────────────────────
-- invoice_number nullable
INSERT INTO smoke_results SELECT 'invoices.invoice_number is text NULLABLE',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='invoices'
      AND column_name='invoice_number' AND data_type='text' AND is_nullable='YES')
  THEN 'PASS' ELSE 'FAIL' END;
-- invoice_number UNIQUE
INSERT INTO smoke_results SELECT 'invoices.invoice_number is UNIQUE',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND t.relname='invoices' AND c.contype='u'
      AND (SELECT array_agg(att.attname ORDER BY att.attnum)
           FROM unnest(c.conkey) k
           JOIN pg_attribute att ON att.attrelid=c.conrelid AND att.attnum=k)
          = ARRAY['invoice_number'])
  THEN 'PASS' ELSE 'FAIL' END;
-- FK column types
INSERT INTO smoke_results SELECT 'invoices.project_id is uuid',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='invoices'
      AND column_name='project_id' AND data_type='uuid')
  THEN 'PASS' ELSE 'FAIL' END;
INSERT INTO smoke_results SELECT 'invoices.client_id is uuid NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='invoices'
      AND column_name='client_id' AND data_type='uuid' AND is_nullable='NO')
  THEN 'PASS' ELSE 'FAIL' END;
INSERT INTO smoke_results SELECT 'invoices.site_id is uuid',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='invoices'
      AND column_name='site_id' AND data_type='uuid')
  THEN 'PASS' ELSE 'FAIL' END;
-- money + tax/holdback columns present
INSERT INTO smoke_results SELECT 'invoices money/tax columns present',
  CASE WHEN (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='invoices'
      AND column_name IN ('tax_rate','tax_exempt','holdback_rate','subtotal',
                          'tax_amount','holdback_amount','total','amount_due')) = 8
  THEN 'PASS' ELSE 'FAIL' END;

-- ─── invoice_lines key columns ───────────────────────────────────────────
INSERT INTO smoke_results SELECT 'invoice_lines.invoice_id is uuid NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='invoice_lines'
      AND column_name='invoice_id' AND data_type='uuid' AND is_nullable='NO')
  THEN 'PASS' ELSE 'FAIL' END;
INSERT INTO smoke_results SELECT 'invoice_lines source/line columns present',
  CASE WHEN (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='invoice_lines'
      AND column_name IN ('description','quantity','unit_price','amount',
                          'source_type','source_id','source_pct','sort_order')) = 8
  THEN 'PASS' ELSE 'FAIL' END;

-- ─── RLS enabled on all three new tables ─────────────────────────────────
INSERT INTO smoke_results
SELECT 'RLS enabled on ' || c.relname,
  CASE WHEN c.relrowsecurity THEN 'PASS' ELSE 'FAIL' END
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN ('invoice_counters','invoices','invoice_lines');

-- ─── Policies by name ────────────────────────────────────────────────────
INSERT INTO smoke_results
SELECT 'policy ' || p || ' exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND policyname=p)
  THEN 'PASS' ELSE 'FAIL' END
FROM unnest(ARRAY[
  'invoice_counters_select_authenticated',
  'invoices_select_authenticated','invoices_write_authenticated',
  'invoice_lines_select_authenticated','invoice_lines_write_authenticated'
]) AS p;

-- ─── Indexes by name ─────────────────────────────────────────────────────
INSERT INTO smoke_results
SELECT 'index ' || i || ' exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname=i)
  THEN 'PASS' ELSE 'FAIL' END
FROM unnest(ARRAY[
  'invoices_project_idx','invoices_client_idx','invoice_lines_invoice_idx'
]) AS i;

-- ─── Report — FAILs first, then alphabetical by check_name ───────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
