-- ============================================================================
-- Nexvelon · ATTACH-2 — Post-deploy Smoke Verification (migration 0036)
-- ============================================================================
-- Run AFTER 0036_attachments_entity_id_text.sql has been applied.
--
-- Verifies attachments.entity_id is now text (so app-minted "q-..." quote ids
-- can be stored) and the entity indexes still exist. Pure-read → COMMIT.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'attachments.entity_id is text NOT NULL',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='attachments'
      AND column_name='entity_id' AND data_type='text' AND is_nullable='NO'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'both entity indexes still present',
  CASE WHEN (SELECT count(*) FROM pg_indexes
    WHERE schemaname='public' AND tablename='attachments'
      AND indexname IN ('attachments_entity_idx','attachments_entity_folder_idx')) = 2
  THEN 'PASS' ELSE 'FAIL' END;

-- ─── Report — FAILs first, then alphabetical by check_name ───────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
