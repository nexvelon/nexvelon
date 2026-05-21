BEGIN;

CREATE TEMP TABLE smoke_results (
  ord         integer,
  check_id    text,
  description text,
  expected    text,
  actual      text,
  status      text
);

INSERT INTO smoke_results VALUES (1, 'bucket_exists', 'quote-drawings bucket exists', 'true',
  (SELECT (count(*) > 0)::text FROM storage.buckets WHERE id = 'quote-drawings'),
  CASE WHEN (SELECT count(*) FROM storage.buckets WHERE id = 'quote-drawings') > 0 THEN 'PASS' ELSE 'FAIL' END);

INSERT INTO smoke_results VALUES (2, 'bucket_private', 'bucket is private (public = false)', 'false',
  (SELECT public::text FROM storage.buckets WHERE id = 'quote-drawings'),
  CASE WHEN (SELECT public FROM storage.buckets WHERE id = 'quote-drawings') = false THEN 'PASS' ELSE 'FAIL' END);

INSERT INTO smoke_results VALUES (3, 'file_size_limit', 'file_size_limit = 20971520 (20MB)', '20971520',
  COALESCE((SELECT file_size_limit::text FROM storage.buckets WHERE id = 'quote-drawings'), 'null'),
  CASE WHEN (SELECT file_size_limit FROM storage.buckets WHERE id = 'quote-drawings') = 20971520 THEN 'PASS' ELSE 'FAIL' END);

INSERT INTO smoke_results VALUES (4, 'mime_pdf_only', 'allowed_mime_types contains application/pdf', 'true',
  (SELECT ('application/pdf' = ANY(allowed_mime_types))::text FROM storage.buckets WHERE id = 'quote-drawings'),
  CASE WHEN 'application/pdf' = ANY((SELECT allowed_mime_types FROM storage.buckets WHERE id = 'quote-drawings')) THEN 'PASS' ELSE 'FAIL' END);

INSERT INTO smoke_results VALUES (5, 'select_policy', 'SELECT policy on quote-drawings exists', 'true',
  (SELECT (count(*) > 0)::text FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT' AND policyname ILIKE '%quote-drawings%'),
  CASE WHEN (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT' AND policyname ILIKE '%quote-drawings%') > 0 THEN 'PASS' ELSE 'FAIL' END);

INSERT INTO smoke_results VALUES (6, 'insert_policy', 'INSERT policy on quote-drawings exists', 'true',
  (SELECT (count(*) > 0)::text FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='INSERT' AND policyname ILIKE '%quote-drawings%'),
  CASE WHEN (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='INSERT' AND policyname ILIKE '%quote-drawings%') > 0 THEN 'PASS' ELSE 'FAIL' END);

INSERT INTO smoke_results VALUES (7, 'delete_policy', 'DELETE policy on quote-drawings exists', 'true',
  (SELECT (count(*) > 0)::text FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='DELETE' AND policyname ILIKE '%quote-drawings%'),
  CASE WHEN (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='DELETE' AND policyname ILIKE '%quote-drawings%') > 0 THEN 'PASS' ELSE 'FAIL' END);

INSERT INTO smoke_results VALUES (8, 'select_authenticated', 'SELECT policy is TO authenticated', 'true',
  (SELECT ('authenticated' = ANY(roles))::text FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT' AND policyname ILIKE '%quote-drawings%' LIMIT 1),
  CASE WHEN 'authenticated' = ANY((SELECT roles FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT' AND policyname ILIKE '%quote-drawings%' LIMIT 1)) THEN 'PASS' ELSE 'FAIL' END);

INSERT INTO smoke_results VALUES (9, 'insert_authenticated', 'INSERT policy is TO authenticated', 'true',
  (SELECT ('authenticated' = ANY(roles))::text FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='INSERT' AND policyname ILIKE '%quote-drawings%' LIMIT 1),
  CASE WHEN 'authenticated' = ANY((SELECT roles FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='INSERT' AND policyname ILIKE '%quote-drawings%' LIMIT 1)) THEN 'PASS' ELSE 'FAIL' END);

INSERT INTO smoke_results VALUES (10, 'delete_authenticated', 'DELETE policy is TO authenticated', 'true',
  (SELECT ('authenticated' = ANY(roles))::text FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='DELETE' AND policyname ILIKE '%quote-drawings%' LIMIT 1),
  CASE WHEN 'authenticated' = ANY((SELECT roles FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd='DELETE' AND policyname ILIKE '%quote-drawings%' LIMIT 1)) THEN 'PASS' ELSE 'FAIL' END);

SELECT * FROM smoke_results
ORDER BY (CASE WHEN status='FAIL' THEN 0 ELSE 1 END), ord;

ROLLBACK;
