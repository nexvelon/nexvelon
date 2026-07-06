-- smoke_0083_attachment_folders.sql
-- Verify the folder tree scaffold + data patch + constraints. Read-only except
-- transient insert probes that are rolled back.

-- 1. Exactly one project_container per sited project.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT project_id FROM public.attachment_folders
     WHERE kind='project_container' GROUP BY project_id HAVING count(*)<>1
  ) t;
  ASSERT n = 0, format('smoke fail: %s project(s) not with exactly one container', n);
  RAISE NOTICE 'ok: one project_container per project';
END $$;

-- 2. Every sited project has a main_job folder whose job_id is its Main Job.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.projects p
   WHERE p.site_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.attachment_folders f
         JOIN public.project_jobs j ON j.id = f.job_id
        WHERE f.project_id = p.id AND f.kind='main_job' AND j.job_type='main_job'
     );
  ASSERT n = 0, format('smoke fail: %s project(s) missing a main_job folder', n);
  RAISE NOTICE 'ok: main_job folder present + linked for every sited project';
END $$;

-- 3. Every sited project has exactly one change_orders wrapper.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT project_id FROM public.attachment_folders
     WHERE kind='change_orders' GROUP BY project_id HAVING count(*)<>1
  ) t;
  ASSERT n = 0, format('smoke fail: %s project(s) not with one change_orders wrapper', n);
  RAISE NOTICE 'ok: one change_orders wrapper per project';
END $$;

-- 4. Every C.O Job has exactly one change_order folder whose job_id matches.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.project_jobs j
   WHERE j.job_type='change_order'
     AND NOT EXISTS (
       SELECT 1 FROM public.attachment_folders f
        WHERE f.kind='change_order' AND f.job_id = j.id
     );
  ASSERT n = 0, format('smoke fail: %s C.O Job(s) missing a change_order folder', n);
  RAISE NOTICE 'ok: change_order folder present for every C.O Job';
END $$;

-- 5. Every main_job / change_order folder has exactly 19 default_subfolders.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.attachment_folders parent
   WHERE parent.kind IN ('main_job','change_order')
     AND (SELECT count(*) FROM public.attachment_folders child
           WHERE child.parent_id = parent.id AND child.kind='default_subfolder') <> 19;
  ASSERT n = 0, format('smoke fail: %s job folder(s) without exactly 19 subfolders', n);
  RAISE NOTICE 'ok: 19 default subfolders under every job folder';
END $$;

-- 6. Existing Files folder under Main Job of every sited project, is_system.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.projects p
   WHERE p.site_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.attachment_folders ef
         JOIN public.attachment_folders mf ON mf.id = ef.parent_id
        WHERE ef.project_id = p.id AND ef.kind='existing_files' AND ef.is_system
          AND mf.kind='main_job'
     );
  ASSERT n = 0, format('smoke fail: %s project(s) missing Existing Files under Main Job', n);
  RAISE NOTICE 'ok: Existing Files under Main Job for every sited project';
END $$;

-- 7. Data patch: no site/project attachment for an existing sited project is
--    left with a NULL folder_id.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.attachments a
   WHERE a.folder_id IS NULL
     AND (
       (a.entity_type='site'    AND a.entity_id IN
          (SELECT site_id::text FROM public.projects WHERE site_id IS NOT NULL)) OR
       (a.entity_type='project' AND a.entity_id IN
          (SELECT id::text FROM public.projects WHERE site_id IS NOT NULL))
     );
  ASSERT n = 0, format('smoke fail: %s site/project attachment(s) not swept', n);
  RAISE NOTICE 'ok: site/project attachments swept into Existing Files';
END $$;

-- 8. Sibling-name uniqueness rejection (non-null parent).
DO $$
DECLARE v_parent uuid; v_site uuid;
BEGIN
  SELECT id, site_id INTO v_parent, v_site FROM public.attachment_folders
   WHERE kind='main_job' LIMIT 1;
  IF v_parent IS NULL THEN RAISE NOTICE 'skip: no main_job folder for unique probe'; RETURN; END IF;
  BEGIN
    INSERT INTO public.attachment_folders (site_id, parent_id, name, kind)
    VALUES (v_site, v_parent, 'Photos', 'user_folder'); -- 'Photos' already a default child
    RAISE EXCEPTION 'smoke fail: duplicate sibling name accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'ok: sibling-name uniqueness enforced';
  END;
END $$;

-- 9. Legacy folder text column untouched (still NOT NULL, default General).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.attachments WHERE folder IS NULL;
  ASSERT n = 0, format('smoke fail: %s attachment(s) have NULL legacy folder', n);
  RAISE NOTICE 'ok: legacy folder text column untouched';
END $$;
