-- ============================================================================
-- Nexvelon · ATTACH-1 — Post-deploy Smoke Verification (migration 0035)
-- ============================================================================
-- Run AFTER 0035_attachments.sql has been applied (and the private
-- "attachments" bucket + Block A storage.objects policies created via the
-- Dashboard).
--
-- Verifies the attachments table + key columns, both RLS policies, both
-- indexes, and the private "attachments" bucket. Pure-read verify → COMMIT.
-- FAILs sort first.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'attachments table exists',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='attachments') THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'entity_type text NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='attachments'
      AND column_name='entity_type' AND data_type='text' AND is_nullable='NO') THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'entity_id uuid NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='attachments'
      AND column_name='entity_id' AND data_type='uuid' AND is_nullable='NO') THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'folder text NOT NULL default General',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='attachments'
      AND column_name='folder' AND data_type='text' AND is_nullable='NO'
      AND column_default LIKE '%General%') THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'path + filename NOT NULL',
  CASE WHEN (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='attachments'
      AND column_name IN ('path','filename') AND is_nullable='NO') = 2 THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'size_bytes is bigint',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='attachments'
      AND column_name='size_bytes' AND data_type='bigint') THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'all 12 columns present',
  CASE WHEN (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='attachments'
      AND column_name IN ('id','entity_type','entity_id','folder','bucket','path',
        'filename','content_type','size_bytes','uploaded_by','created_at','updated_at')
  ) = 12 THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'RLS enabled on attachments',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables
    WHERE schemaname='public' AND tablename='attachments' AND rowsecurity=true) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'both RLS policies present',
  CASE WHEN (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='attachments'
      AND policyname IN ('attachments_select_authenticated','attachments_write_authenticated')) = 2
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'both entity indexes present',
  CASE WHEN (SELECT count(*) FROM pg_indexes
    WHERE schemaname='public' AND tablename='attachments'
      AND indexname IN ('attachments_entity_idx','attachments_entity_folder_idx')) = 2
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'updated_at trigger present',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.triggers
    WHERE event_object_schema='public' AND event_object_table='attachments'
      AND trigger_name='set_updated_at') THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'attachments bucket exists and is PRIVATE',
  CASE WHEN EXISTS (SELECT 1 FROM storage.buckets
    WHERE id='attachments' AND public=false) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'all 4 storage.objects attachment policies present',
  CASE WHEN (SELECT count(*) FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname IN ('attachments_select','attachments_insert','attachments_update','attachments_delete')) = 4
  THEN 'PASS' ELSE 'FAIL' END;

-- ─── Report — FAILs first, then alphabetical by check_name ───────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
