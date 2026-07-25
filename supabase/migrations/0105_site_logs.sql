-- 0105_site_logs.sql
-- PROJ2-16 — daily site log / field report, per Job. A dated daily record: crew
-- on site + hours, weather, work performed, materials received, delays,
-- visitors, safety notes, and photos (via the attachments flow).
--
-- IMPORTANT (§2d boundary): the crew HOURS here are a FIELD RECORD, not a cost
-- input. Labour cost already flows labour_entries → project_cost_centers →
-- margin. The site log NEVER writes to labour_entries and its hours NEVER feed
-- the cost rollup — double-feeding would double-count. This may later become a
-- SOURCE for labour_entries, but that is a deliberate future step, not an
-- implicit link. Nothing here touches cost.
--
-- §2.1 additive; §3: GRANTs + RLS + policies on BOTH tables.

BEGIN;

CREATE TABLE public.site_logs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  job_id             uuid NOT NULL REFERENCES public.project_jobs(id) ON DELETE CASCADE,
  log_date           date NOT NULL DEFAULT current_date,
  weather            text,                    -- free text (no weather API in v1)
  temperature_c      numeric(5,1),
  work_performed     text,                    -- the main narrative
  delays_issues      text,
  materials_received text,
  visitors           text,                    -- inspectors, client, consultant
  safety_notes       text,                    -- incidents / toolbox talks
  status             text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','submitted')),
  submitted_at       timestamptz,
  submitted_by       uuid,
  created_by         uuid,
  updated_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- One log per job per day — a day gets one field report; edits amend it.
CREATE UNIQUE INDEX site_logs_job_date_unique
  ON public.site_logs (job_id, log_date);
CREATE INDEX site_logs_project_idx ON public.site_logs (project_id);
CREATE INDEX site_logs_date_idx ON public.site_logs (log_date);

CREATE TRIGGER site_logs_set_updated_at
  BEFORE UPDATE ON public.site_logs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Crew lines: who was on site and for how long (FIELD RECORD, NOT cost).
CREATE TABLE public.site_log_crew (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_log_id      uuid NOT NULL REFERENCES public.site_logs(id) ON DELETE CASCADE,
  tech_id          uuid REFERENCES public.techs(id) ON DELETE SET NULL,
  subcontractor_id uuid REFERENCES public.subcontractors(id) ON DELETE SET NULL,
  person_name      text,                      -- free-text fallback for non-assigned people
  hours            numeric(6,2),
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
-- At most one linked party kind; person_name is the fallback when neither FK is
-- set. A crew row must identify SOMEONE (a linked party OR a name).
ALTER TABLE public.site_log_crew
  ADD CONSTRAINT site_log_crew_party_check
  CHECK (num_nonnulls(tech_id, subcontractor_id) <= 1
         AND (num_nonnulls(tech_id, subcontractor_id) = 1
              OR person_name IS NOT NULL));
CREATE INDEX site_log_crew_log_idx ON public.site_log_crew (site_log_id);

-- §3 clauses on both tables (project_jobs pattern).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_log_crew TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_log_crew TO service_role;

ALTER TABLE public.site_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_log_crew ENABLE ROW LEVEL SECURITY;

CREATE POLICY site_logs_select_authenticated
  ON public.site_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY site_logs_all_authenticated
  ON public.site_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY site_log_crew_select_authenticated
  ON public.site_log_crew FOR SELECT TO authenticated USING (true);
CREATE POLICY site_log_crew_all_authenticated
  ON public.site_log_crew FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse, for the next operator):
--   BEGIN;
--   DROP TABLE IF EXISTS public.site_log_crew;
--   DROP TABLE IF EXISTS public.site_logs;
--   COMMIT;
-- Order matters: crew references logs.
-- ─────────────────────────────────────────────────────────────────────────────
