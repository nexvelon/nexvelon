BEGIN;

-- Phase 5b: Storage bucket for quote drawings PDFs.
-- Path structure: {auth_user_id}/{timestamp}-{original-filename}.pdf
-- Each authenticated user can read/write/delete only their own folder.

-- Create private bucket (idempotent).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'quote-drawings',
  'quote-drawings',
  false,
  20971520,  -- 20 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies on storage.objects (the bucket itself has RLS enabled by default).

CREATE POLICY "Authenticated users can read their own quote-drawings"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'quote-drawings'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Authenticated users can upload to their own quote-drawings"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'quote-drawings'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Authenticated users can delete their own quote-drawings"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'quote-drawings'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

COMMIT;
