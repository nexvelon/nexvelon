-- 0034_product_image.sql
-- IMG-1: part image support. The public Storage bucket "product-images" is
-- created via the Supabase Dashboard (Storage → New bucket, Public). This
-- migration adds the storage.objects access policies for that bucket (read is
-- public via the bucket setting; authenticated users may upload/update/delete)
-- and an image_path reference column on inventory_products.
--
-- Applied via the Dashboard SQL Editor (storage.objects is owned by the
-- storage schema; the CLI is not used in this project).

BEGIN;

-- authenticated users can upload / update / delete in the product-images bucket (read is public)
DROP POLICY IF EXISTS "product_images_insert" ON storage.objects;
CREATE POLICY "product_images_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product_images_update" ON storage.objects;
CREATE POLICY "product_images_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'product-images') WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product_images_delete" ON storage.objects;
CREATE POLICY "product_images_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'product-images');

-- product image reference (the storage path)
ALTER TABLE public.inventory_products ADD COLUMN IF NOT EXISTS image_path text;

COMMIT;
