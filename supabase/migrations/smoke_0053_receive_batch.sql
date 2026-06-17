-- ============================================================================
-- Nexvelon · FIX-BATCH-O — Post-deploy Smoke Verification (0053)
-- ============================================================================
-- Run AFTER 0053_receive_batch.sql. Pure-read → COMMIT.
-- Verifies inventory_stock.receive_batch_id (uuid, nullable) + its index.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'inventory_stock.receive_batch_id is uuid nullable',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_stock'
      AND column_name='receive_batch_id' AND data_type='uuid' AND is_nullable='YES')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'index inventory_stock_receive_batch_idx exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='inventory_stock_receive_batch_idx')
  THEN 'PASS' ELSE 'FAIL' END;

SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
