-- SCHED-1 (migration 0111) — the dispatch model. Three new tables, the keystone
-- of Sprint 3's scheduling module:
--
--   tech_certifications   — the tech-side of the cert hard-block (panel certs:
--                           Kantech / Genetec / C-CURE / ESA / working-at-heights).
--   schedule_jobs         — a dispatchable work unit. Originates from a project
--                           job OR stands alone as an ad-hoc service call (D3).
--   schedule_assignments  — a TIME-WINDOWED booking of a tech to a schedule_job
--                           (D2: timestamptz start/end, temporal overlap = conflict).
--
-- LOCKED DECISIONS (Sprint 3 audit):
--   D1 — schedule_assignments is a NEW table, NOT an extension of job_assignments.
--        job_assignments stays the durable compliance-gated roster; this migration
--        does not touch it (a booking may soft-link to a job_assignment row).
--   D2 — bookings are time-windowed; no-overlap is enforced per tech.
--   D3 — schedule_jobs can be project-linked or standalone (all project FKs SET NULL).
--
-- SPRINT INVARIANT — a booking is a PLAN and NEVER feeds cost. There is
-- deliberately NO link from schedule_assignments to labour_entries / cost_centers
-- here; the only booking→cost path is the explicit opt-in conversion in SCHED-4.

BEGIN;

-- ── tech certifications ──────────────────────────────────────────────────────
CREATE TABLE public.tech_certifications (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tech_id          uuid NOT NULL REFERENCES public.techs(id) ON DELETE CASCADE,
  cert_type        text NOT NULL,   -- 'kantech','genetec','c_cure','esa',
                                     -- 'working_at_heights', … free-ish in v1
  cert_name        text,
  issuer           text,
  reference_number text,
  issued_date      date,
  expiry_date      date,            -- NULL = no expiry
  attachment_id    uuid REFERENCES public.attachments(id) ON DELETE SET NULL,
  notes            text,
  created_by       uuid,
  updated_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tech_certifications
  ADD CONSTRAINT tech_certifications_date_order_check
  CHECK (issued_date IS NULL OR expiry_date IS NULL OR expiry_date >= issued_date);
CREATE INDEX tech_certifications_tech_idx ON public.tech_certifications (tech_id);
CREATE INDEX tech_certifications_expiry_idx ON public.tech_certifications (expiry_date);

-- ── schedule_jobs (the dispatchable work unit) ───────────────────────────────
CREATE TABLE public.schedule_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference       text NOT NULL UNIQUE,   -- SVC-YYYY-NNNN
  title           text NOT NULL,
  job_type        text NOT NULL DEFAULT 'service'
                  CHECK (job_type IN ('install','service','inspection','commissioning','other')),
  priority        text NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('low','normal','high','urgent')),
  -- origin (D3): from a project job, OR standalone service call. All SET NULL so
  -- deleting a project never destroys the dispatch history.
  project_id      uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  project_job_id  uuid REFERENCES public.project_jobs(id) ON DELETE SET NULL,
  client_id       uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  site_id         uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  location_text   text,   -- ad-hoc location when there's no site record
  description     text,
  required_certs  text[] NOT NULL DEFAULT '{}',   -- cert_types a booked tech must hold
  estimated_hours numeric(6,2),
  status          text NOT NULL DEFAULT 'unscheduled'
                  CHECK (status IN ('unscheduled','scheduled','in_progress','completed','cancelled')),
  window_start    timestamptz,   -- desired/target window (optional)
  window_end      timestamptz,
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX schedule_jobs_status_idx ON public.schedule_jobs (status);
CREATE INDEX schedule_jobs_project_idx ON public.schedule_jobs (project_id);
CREATE INDEX schedule_jobs_site_idx ON public.schedule_jobs (site_id);

-- ── schedule_assignments (the time-windowed booking) ─────────────────────────
CREATE TABLE public.schedule_assignments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_job_id   uuid NOT NULL REFERENCES public.schedule_jobs(id) ON DELETE CASCADE,
  tech_id           uuid NOT NULL REFERENCES public.techs(id) ON DELETE RESTRICT,
  starts_at         timestamptz NOT NULL,
  ends_at           timestamptz NOT NULL,
  status            text NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('tentative','confirmed','completed','cancelled')),
  -- optional soft-link to the durable roster fact (D1); SET NULL keeps the
  -- booking if the roster row is removed.
  job_assignment_id uuid REFERENCES public.job_assignments(id) ON DELETE SET NULL,
  notes             text,
  created_by        uuid,
  updated_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.schedule_assignments
  ADD CONSTRAINT schedule_assignments_time_order_check CHECK (ends_at > starts_at);
CREATE INDEX schedule_assignments_tech_idx ON public.schedule_assignments (tech_id);
CREATE INDEX schedule_assignments_job_idx ON public.schedule_assignments (schedule_job_id);
CREATE INDEX schedule_assignments_window_idx ON public.schedule_assignments (starts_at, ends_at);

-- NO-OVERLAP per tech among ACTIVE bookings (2e — DB-enforced, the strongest
-- guarantee). btree_gist lets us mix the scalar tech_id (=) with the range
-- overlap (&&) in one GiST exclusion. CANCELLED bookings are excluded from the
-- constraint via the WHERE clause, so cancelling frees the slot and a cancelled
-- booking never conflicts. The API also pre-checks for a friendly message and
-- maps 23P01 (exclusion_violation) to a typed tech_double_booked error.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE public.schedule_assignments
  ADD CONSTRAINT schedule_assignments_no_overlap
  EXCLUDE USING gist (
    tech_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status <> 'cancelled');

-- Sequential per-year SVC reference (mirror next_count_reference).
CREATE OR REPLACE FUNCTION public.next_schedule_job_reference()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE yr text; n integer;
BEGIN
  yr := to_char(current_date, 'YYYY');
  SELECT COALESCE(MAX(CAST(SUBSTRING(reference FROM 'SVC-'||yr||'-(\d+)$') AS integer)), 0) + 1
    INTO n
    FROM public.schedule_jobs
   WHERE reference LIKE 'SVC-'||yr||'-%';
  RETURN 'SVC-'||yr||'-'||LPAD(n::text, 4, '0');
END; $$;

-- updated_at triggers on all three.
CREATE TRIGGER tech_certifications_set_updated_at
  BEFORE UPDATE ON public.tech_certifications
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER schedule_jobs_set_updated_at
  BEFORE UPDATE ON public.schedule_jobs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER schedule_assignments_set_updated_at
  BEFORE UPDATE ON public.schedule_assignments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- §3: NEW tables → GRANTs + RLS + policies (project_jobs pattern).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tech_certifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tech_certifications TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_assignments TO service_role;

ALTER TABLE public.tech_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tech_certifications_select_authenticated
  ON public.tech_certifications FOR SELECT TO authenticated USING (true);
CREATE POLICY tech_certifications_all_authenticated
  ON public.tech_certifications FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY schedule_jobs_select_authenticated
  ON public.schedule_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY schedule_jobs_all_authenticated
  ON public.schedule_jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY schedule_assignments_select_authenticated
  ON public.schedule_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY schedule_assignments_all_authenticated
  ON public.schedule_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse, for the next operator):
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.next_schedule_job_reference();
--   DROP TABLE IF EXISTS public.schedule_assignments;
--   DROP TABLE IF EXISTS public.schedule_jobs;
--   DROP TABLE IF EXISTS public.tech_certifications;
--   -- btree_gist left installed (harmless; other features may use it).
--   COMMIT;
