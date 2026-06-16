-- ============================================================================
-- Nexvelon · MATERIALS-1 (Batch D5) — Post-deploy Smoke Verification (0049)
-- ============================================================================
-- Run AFTER 0049_invoice_line_part.sql. Pure-read → COMMIT.
-- Verifies invoice_lines.product_id (uuid) + source_stock_id (uuid); the
-- invoice_lines_product_idx index; invoices.line_identifier_fields exists and
-- defaults to {name}. (Simple — no name[]/text[] equality comparisons.)
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'invoice_lines.product_id is uuid',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='invoice_lines'
      AND column_name='product_id' AND data_type='uuid')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'invoice_lines.source_stock_id is uuid',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='invoice_lines'
      AND column_name='source_stock_id' AND data_type='uuid')
  THEN 'PASS' ELSE 'FAIL' END;

-- product_id is a real FK
INSERT INTO smoke_results SELECT 'invoice_lines.product_id has FK',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND t.relname='invoice_lines' AND c.contype='f'
      AND c.conname LIKE '%product_id%')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'index invoice_lines_product_idx exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='invoice_lines_product_idx')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'invoices.line_identifier_fields is array NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='invoices'
      AND column_name='line_identifier_fields' AND data_type='ARRAY'
      AND is_nullable='NO')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'line_identifier_fields default is {name}',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='invoices'
      AND column_name='line_identifier_fields'
      AND column_default LIKE '%name%')
  THEN 'PASS' ELSE 'FAIL' END;

SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
