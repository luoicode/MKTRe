INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "product_images_public_read" ON storage.objects;
CREATE POLICY "product_images_public_read" ON storage.objects
FOR SELECT
USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product_images_admin_write" ON storage.objects;
CREATE POLICY "product_images_admin_write" ON storage.objects
FOR ALL
USING (
  bucket_id = 'product-images'
  AND public.has_role('admin')
)
WITH CHECK (
  bucket_id = 'product-images'
  AND public.has_role('admin')
);

NOTIFY pgrst, 'reload schema';
