-- ============================================================================
-- Nexvelon · IMG-1 — Post-deploy Smoke Verification (migration 0034)
-- ============================================================================
-- Run AFTER 0034_product_image.sql has been applied (and the public
-- "product-images" bucket created in the Dashboard).
--
-- Verifies inventory_products.image_path and the three storage.objects policies
-- for the product-images bucket. Pure-read verify → COMMIT. FAILs sort first.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'inventory_products.image_path is text nullable',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_products'
      AND column_name='image_path' AND data_type='text' AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'policy product_images_insert exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='product_images_insert'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'policy product_images_update exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='product_images_update'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'policy product_images_delete exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='product_images_delete'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'product-images bucket exists and is public',
  CASE WHEN EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id='product-images' AND public=true
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── Report — FAILs first, then alphabetical by check_name ───────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
