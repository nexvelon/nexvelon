-- 0083_attachment_folders.sql
-- PROJ2-4b — attachment folder tree. Folders become first-class rows so empty
-- defaults persist, folders are renameable/deletable/reorderable, and Site /
-- Project / Job are three lenses over ONE tree. Scaffolds every existing
-- project's tree (project_container → main_job + change_orders → 19 default
-- subfolders per Job + an "Existing Files" bucket under Main Job) and sweeps
-- the live project's existing attachments into Existing Files.
--
-- §3: attachment_folders is a NEW table → GRANTs + RLS + policy.
-- §2.1: attachments.folder_id is additive/nullable; the legacy `folder` text
--       column is left UNTOUCHED.
-- §2.2: storage blobs are never moved; the data patch only sets folder_id.
--
-- Deviation (flagged): projects with a NULL site_id are skipped — the folder
-- tree is site-rooted (attachment_folders.site_id NOT NULL) and there is no
-- site to anchor them to. The live project has a site, so it scaffolds.

BEGIN;

-- 4.1 — attachment_folders.
CREATE TABLE public.attachment_folders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  project_id  uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  job_id      uuid REFERENCES public.project_jobs(id) ON DELETE CASCADE,
  parent_id   uuid REFERENCES public.attachment_folders(id) ON DELETE CASCADE,
  name        text NOT NULL,
  slug        text,
  kind        text NOT NULL CHECK (kind IN (
                'project_container','main_job','change_orders','change_order',
                'default_subfolder','user_folder','existing_files'
              )),
  is_system   boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  created_by  uuid,
  updated_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX attachment_folders_site_idx    ON public.attachment_folders (site_id);
CREATE INDEX attachment_folders_project_idx ON public.attachment_folders (project_id);
CREATE INDEX attachment_folders_job_idx     ON public.attachment_folders (job_id);
CREATE INDEX attachment_folders_parent_idx  ON public.attachment_folders (parent_id);
-- No sibling name collisions. NOTE: root nodes (parent_id NULL) are not covered
-- by this constraint because NULLs are distinct in a standard unique index —
-- scaffolded roots use distinct 'Project N' names, so this is acceptable.
CREATE UNIQUE INDEX attachment_folders_sibling_name_unique
  ON public.attachment_folders (site_id, parent_id, name);

CREATE TRIGGER attachment_folders_set_updated_at
  BEFORE UPDATE ON public.attachment_folders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- §3 GRANTs + RLS + policy.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attachment_folders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attachment_folders TO service_role;

ALTER TABLE public.attachment_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY attachment_folders_select_authenticated
  ON public.attachment_folders FOR SELECT TO authenticated USING (true);
CREATE POLICY attachment_folders_all_authenticated
  ON public.attachment_folders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4.2 — attachments.folder_id (additive, §2.1).
ALTER TABLE public.attachments
  ADD COLUMN folder_id uuid REFERENCES public.attachment_folders(id) ON DELETE SET NULL;
CREATE INDEX attachments_folder_id_idx ON public.attachments (folder_id);

-- ═══════════════════════════════════════════════════════════
-- 4.5/4.6 — SCAFFOLD + DATA PATCH for every existing sited project.
-- ═══════════════════════════════════════════════════════════
DO $$
DECLARE
  -- 19 default subfolders, in authoritative order (mirrors
  -- lib/attachments/default-subfolders.ts).
  v_sub text[][] := ARRAY[
    ARRAY['Requests','requests'],
    ARRAY['Supplier Quotes','supplier_quotes'],
    ARRAY['Contract Documentation','contract_documentation'],
    ARRAY['Proposals','proposals'],
    ARRAY['Approvals','approvals'],
    ARRAY['Site Drawings','site_drawings'],
    ARRAY['Take-offs','take_offs'],
    ARRAY['Checklist','checklist'],
    ARRAY['Photos','photos'],
    ARRAY['Videos','videos'],
    ARRAY['Data Sheets','data_sheets'],
    ARRAY['Shop Drawings','shop_drawings'],
    ARRAY['Invoices','invoices'],
    ARRAY['Purchase Orders','purchase_orders'],
    ARRAY['Pickup Slips','pickup_slips'],
    ARRAY['Commissioning Files','commissioning_files'],
    ARRAY['User/Operations & Maintenance Docs','user_ops_maintenance_docs'],
    ARRAY['Warranty Letter','warranty_letter'],
    ARRAY['Other Docs','other_docs']
  ];
  proj        RECORD;
  co          RECORD;
  v_mainjob   uuid;
  v_container uuid;
  v_mainfld   uuid;
  v_cowrap    uuid;
  v_cofld     uuid;
  v_existing  uuid;
  i           int;
BEGIN
  FOR proj IN
    SELECT p.id, p.site_id,
           row_number() OVER (PARTITION BY p.site_id ORDER BY p.created_at, p.id) AS ord
      FROM public.projects p
     WHERE p.site_id IS NOT NULL
     ORDER BY p.site_id, p.created_at, p.id
  LOOP
    SELECT id INTO v_mainjob FROM public.project_jobs
      WHERE project_id = proj.id AND job_type = 'main_job' LIMIT 1;

    -- Project container (root).
    INSERT INTO public.attachment_folders
      (site_id, project_id, job_id, parent_id, name, slug, kind, is_system, sort_order)
    VALUES (proj.site_id, proj.id, NULL, NULL,
            'Project ' || proj.ord, 'project_container', 'project_container', true, 0)
    RETURNING id INTO v_container;

    -- Main Job node.
    INSERT INTO public.attachment_folders
      (site_id, project_id, job_id, parent_id, name, slug, kind, is_system, sort_order)
    VALUES (proj.site_id, proj.id, v_mainjob, v_container,
            'Main Job', 'main_job', 'main_job', true, 0)
    RETURNING id INTO v_mainfld;

    -- Change Orders wrapper.
    INSERT INTO public.attachment_folders
      (site_id, project_id, job_id, parent_id, name, slug, kind, is_system, sort_order)
    VALUES (proj.site_id, proj.id, NULL, v_container,
            'Change Orders', 'change_orders', 'change_orders', true, 1)
    RETURNING id INTO v_cowrap;

    -- 19 defaults under Main Job.
    FOR i IN 1 .. array_length(v_sub, 1) LOOP
      INSERT INTO public.attachment_folders
        (site_id, project_id, job_id, parent_id, name, slug, kind, is_system, sort_order)
      VALUES (proj.site_id, proj.id, v_mainjob, v_mainfld,
              v_sub[i][1], v_sub[i][2], 'default_subfolder', true, i - 1);
    END LOOP;

    -- Existing Files under Main Job (data-patch sweep target).
    INSERT INTO public.attachment_folders
      (site_id, project_id, job_id, parent_id, name, slug, kind, is_system, sort_order)
    VALUES (proj.site_id, proj.id, v_mainjob, v_mainfld,
            'Existing Files', 'existing_files', 'existing_files', true, 100)
    RETURNING id INTO v_existing;

    -- Each Change Order Job: a change_order folder + its 19 defaults.
    FOR co IN
      SELECT id, co_number FROM public.project_jobs
       WHERE project_id = proj.id AND job_type = 'change_order'
       ORDER BY co_number
    LOOP
      INSERT INTO public.attachment_folders
        (site_id, project_id, job_id, parent_id, name, slug, kind, is_system, sort_order)
      VALUES (proj.site_id, proj.id, co.id, v_cowrap,
              'C.O #' || co.co_number, 'co_' || co.co_number, 'change_order', true, co.co_number)
      RETURNING id INTO v_cofld;

      FOR i IN 1 .. array_length(v_sub, 1) LOOP
        INSERT INTO public.attachment_folders
          (site_id, project_id, job_id, parent_id, name, slug, kind, is_system, sort_order)
        VALUES (proj.site_id, proj.id, co.id, v_cofld,
                v_sub[i][1], v_sub[i][2], 'default_subfolder', true, i - 1);
      END LOOP;
    END LOOP;

    -- Data patch: sweep this project's realm of attachments into Existing Files.
    -- folder_id IS NULL guard means the first project on a site claims shared
    -- site-level attachments; storage blobs + entity_type/entity_id untouched.
    UPDATE public.attachments a
       SET folder_id = v_existing
     WHERE a.folder_id IS NULL
       AND (
         (a.entity_type = 'site'    AND a.entity_id = proj.site_id::text) OR
         (a.entity_type = 'project' AND a.entity_id = proj.id::text) OR
         (a.entity_type = 'quote'   AND a.entity_id IN
            (SELECT quote_id FROM public.project_quotes WHERE project_id = proj.id)) OR
         (a.entity_type = 'invoice' AND a.entity_id IN
            (SELECT id::text FROM public.invoices WHERE project_id = proj.id))
       );
  END LOOP;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════
-- Rollback (per §1 — documented, not executed).
-- ═══════════════════════════════════════════════════════════
-- ALTER TABLE public.attachments DROP COLUMN IF EXISTS folder_id;
-- DROP TABLE IF EXISTS public.attachment_folders;
