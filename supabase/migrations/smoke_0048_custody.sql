-- ============================================================================
-- Nexvelon · CUSTODY-1 (Batch D3) — Post-deploy Smoke Verification (0048)
-- ============================================================================
-- Run AFTER 0048_custody.sql. Pure-read → COMMIT.
-- Verifies the six new inventory_stock columns + their types (custody_status
-- text NOT NULL default 'in_stock'). (Simple — no array comparisons.)
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'custody_status is text NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_stock'
      AND column_name='custody_status' AND data_type='text' AND is_nullable='NO')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'custody_status default is in_stock',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_stock'
      AND column_name='custody_status'
      AND column_default LIKE '%in_stock%')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results
SELECT 'column ' || c || ' is timestamptz',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_stock'
      AND column_name=c AND data_type='timestamp with time zone')
  THEN 'PASS' ELSE 'FAIL' END
FROM unnest(ARRAY['delivered_at','installed_at','lost_at']) AS c;

INSERT INTO smoke_results SELECT 'custody_proof_attachment_id is uuid',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_stock'
      AND column_name='custody_proof_attachment_id' AND data_type='uuid')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'last_known_label is text',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_stock'
      AND column_name='last_known_label' AND data_type='text')
  THEN 'PASS' ELSE 'FAIL' END;

SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
