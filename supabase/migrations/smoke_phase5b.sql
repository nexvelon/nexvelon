-- ============================================================================
-- Nexvelon · QD-2 Phase 5b — Post-deploy Smoke Verification (migration 0011)
-- ============================================================================
-- Run AFTER 0011_quote_drawings_storage.sql has been applied. Dashboard SQL
-- Editor format: one TEMP table, single final SELECT, FAILs first, ROLLBACK
-- (read-only — the whole tx rolls back regardless).
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  ord         integer,
  check_id    text,
  description text,
  expected    text,
  actual      text,
  status      text
);

-- Check 1: bucket exists
INSERT INTO smoke_results VALUES (1, 'bucket_exists',
  'storage bucket ''quote-drawings'' exists', 'true',
  (SELECT (count(*) > 0)::text FROM storage.buckets WHERE id = 'quote-drawings'),
  CASE WHEN (SELECT count(*) FROM storage.buckets WHERE id = 'quote-drawings') > 0
       THEN 'PASS' ELSE 'FAIL' END);

-- Check 2: bucket is private
INSERT INTO smoke_results VALUES (2, 'bucket_private',
  'bucket is private (public = false)', 'false',
  (SELECT public::text FROM storage.buckets WHERE id = 'quote-drawings'),
  CASE WHEN (SELECT public FROM storage.buckets WHERE id = 'quote-drawings') = false
       THEN 'PASS' ELSE 'FAIL' END);

-- Check 3: file_size_limit = 20 MB
INSERT INTO smoke_results VALUES (3, 'size_limit_20mb',
  'file_size_limit = 20971520 (20 MB)', '20971520',
  (SELECT file_size_limit::text FROM storage.buckets WHERE id = 'quote-drawings'),
  CASE WHEN (SELECT file_size_limit FROM storage.buckets WHERE id = 'quote-drawings') = 20971520
       THEN 'PASS' ELSE 'FAIL' END);

-- Check 4: allowed_mime_types includes application/pdf
INSERT INTO smoke_results VALUES (4, 'mime_pdf_only',
  'allowed_mime_types includes ''application/pdf''', 'true',
  (SELECT ('application/pdf' = ANY(allowed_mime_types))::text
   FROM storage.buckets WHERE id = 'quote-drawings'),
  CASE WHEN (SELECT 'application/pdf' = ANY(allowed_mime_types)
             FROM storage.buckets WHERE id = 'quote-drawings') = true
       THEN 'PASS' ELSE 'FAIL' END);

-- Check 5: SELECT policy exists on storage.objects
INSERT INTO smoke_results VALUES (5, 'policy_select_exists',
  'SELECT policy exists on storage.objects', 'true',
  (SELECT (count(*) > 0)::text FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname = 'Authenticated users can read their own quote-drawings'
     AND cmd = 'SELECT'),
  CASE WHEN (SELECT count(*) FROM pg_policies
             WHERE schemaname = 'storage' AND tablename = 'objects'
               AND policyname = 'Authenticated users can read their own quote-drawings'
               AND cmd = 'SELECT') > 0
       THEN 'PASS' ELSE 'FAIL' END);

-- Check 6: INSERT policy exists on storage.objects
INSERT INTO smoke_results VALUES (6, 'policy_insert_exists',
  'INSERT policy exists on storage.objects', 'true',
  (SELECT (count(*) > 0)::text FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname = 'Authenticated users can upload to their own quote-drawings'
     AND cmd = 'INSERT'),
  CASE WHEN (SELECT count(*) FROM pg_policies
             WHERE schemaname = 'storage' AND tablename = 'objects'
               AND policyname = 'Authenticated users can upload to their own quote-drawings'
               AND cmd = 'INSERT') > 0
       THEN 'PASS' ELSE 'FAIL' END);

-- Check 7: DELETE policy exists on storage.objects
INSERT INTO smoke_results VALUES (7, 'policy_delete_exists',
  'DELETE policy exists on storage.objects', 'true',
  (SELECT (count(*) > 0)::text FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname = 'Authenticated users can delete their own quote-drawings'
     AND cmd = 'DELETE'),
  CASE WHEN (SELECT count(*) FROM pg_policies
             WHERE schemaname = 'storage' AND tablename = 'objects'
               AND policyname = 'Authenticated users can delete their own quote-drawings'
               AND cmd = 'DELETE') > 0
       THEN 'PASS' ELSE 'FAIL' END);

-- Check 8: SELECT policy is TO authenticated and matches auth.uid() folder
INSERT INTO smoke_results VALUES (8, 'policy_select_scoped',
  'SELECT policy restricted TO authenticated + auth.uid() folder match', 'true',
  (SELECT ('authenticated' = ANY(roles)
           AND coalesce(qual, '') LIKE '%uid%'
           AND coalesce(qual, '') LIKE '%foldername%')::text
   FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname = 'Authenticated users can read their own quote-drawings'),
  CASE WHEN (SELECT 'authenticated' = ANY(roles)
                    AND coalesce(qual, '') LIKE '%uid%'
                    AND coalesce(qual, '') LIKE '%foldername%'
             FROM pg_policies
             WHERE schemaname = 'storage' AND tablename = 'objects'
               AND policyname = 'Authenticated users can read their own quote-drawings') = true
       THEN 'PASS' ELSE 'FAIL' END);

-- Check 9: INSERT policy is TO authenticated and matches auth.uid() folder
INSERT INTO smoke_results VALUES (9, 'policy_insert_scoped',
  'INSERT policy restricted TO authenticated + auth.uid() folder match', 'true',
  (SELECT ('authenticated' = ANY(roles)
           AND coalesce(with_check, '') LIKE '%uid%'
           AND coalesce(with_check, '') LIKE '%foldername%')::text
   FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname = 'Authenticated users can upload to their own quote-drawings'),
  CASE WHEN (SELECT 'authenticated' = ANY(roles)
                    AND coalesce(with_check, '') LIKE '%uid%'
                    AND coalesce(with_check, '') LIKE '%foldername%'
             FROM pg_policies
             WHERE schemaname = 'storage' AND tablename = 'objects'
               AND policyname = 'Authenticated users can upload to their own quote-drawings') = true
       THEN 'PASS' ELSE 'FAIL' END);

-- Check 10: DELETE policy is TO authenticated and matches auth.uid() folder
INSERT INTO smoke_results VALUES (10, 'policy_delete_scoped',
  'DELETE policy restricted TO authenticated + auth.uid() folder match', 'true',
  (SELECT ('authenticated' = ANY(roles)
           AND coalesce(qual, '') LIKE '%uid%'
           AND coalesce(qual, '') LIKE '%foldername%')::text
   FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname = 'Authenticated users can delete their own quote-drawings'),
  CASE WHEN (SELECT 'authenticated' = ANY(roles)
                    AND coalesce(qual, '') LIKE '%uid%'
                    AND coalesce(qual, '') LIKE '%foldername%'
             FROM pg_policies
             WHERE schemaname = 'storage' AND tablename = 'objects'
               AND policyname = 'Authenticated users can delete their own quote-drawings') = true
       THEN 'PASS' ELSE 'FAIL' END);

-- ----------------------------------------------------------------------------
-- Consolidated panel — FAIL rows first, then ord.
-- ----------------------------------------------------------------------------
SELECT ord, check_id, description, expected, actual, status
FROM smoke_results
ORDER BY (status = 'PASS'), ord;

ROLLBACK;
