-- 0035_attachments.sql
-- ATTACH-1: unified, table-backed attachments. One row per uploaded file,
-- keyed by (entity_type, entity_id) so any entity can carry attachments without
-- a per-entity column. Files live in a PRIVATE Storage bucket "attachments"
-- (signed URLs only — never public). The bucket and its storage.objects
-- policies (Block A: authenticated full CRUD, nothing public) are created via
-- the Supabase Dashboard; only the public.attachments table is in this file.
--
-- Mirrors the 0030 house style: gen_random_uuid id, created/updated timestamps,
-- shared handle_updated_at() trigger, RLS authenticated read + write.
-- entity_type is free-text (no CHECK) so new entity kinds need no migration.

BEGIN;

CREATE TABLE IF NOT EXISTS public.attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  folder text NOT NULL DEFAULT 'General',
  bucket text NOT NULL DEFAULT 'attachments',
  path text NOT NULL,
  filename text NOT NULL,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attachments_entity_idx ON public.attachments (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS attachments_entity_folder_idx ON public.attachments (entity_type, entity_id, folder);

DROP TRIGGER IF EXISTS set_updated_at ON public.attachments;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.attachments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attachments_select_authenticated ON public.attachments;
CREATE POLICY attachments_select_authenticated ON public.attachments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS attachments_write_authenticated ON public.attachments;
CREATE POLICY attachments_write_authenticated ON public.attachments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
