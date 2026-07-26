-- SCHED-3 (migration 0112) — technician availability: per-tech weekly working
-- hours + time-off/absences with a lightweight approval workflow. Feeds the
-- availability guard (approved leave blocks a booking; off-hours warns), the
-- board's shaded non-working areas + leave bands, and the honest Utilization /
-- Techs-Out stats SCHED-2 removed.
--
-- NO seed of default hours — we never fabricate a schedule. A tech with no
-- working_hours rows is "hours unknown": no off-hours warning (we can't tell)
-- and excluded from the utilization denominator (never a fake 0 or 24/7).

BEGIN;

-- Per-tech weekly working hours — one row per worked day-of-week (0=Sun..6=Sat).
-- v1 is a single contiguous window per day; split shifts are a future item.
CREATE TABLE public.tech_working_hours (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tech_id      uuid NOT NULL REFERENCES public.techs(id) ON DELETE CASCADE,
  day_of_week  integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time   time NOT NULL,
  end_time     time NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tech_working_hours
  ADD CONSTRAINT tech_working_hours_time_order_check CHECK (end_time > start_time);
CREATE UNIQUE INDEX tech_working_hours_tech_dow_unique
  ON public.tech_working_hours (tech_id, day_of_week);

-- Time off / absences, with an approval status a dispatcher/admin sets.
CREATE TABLE public.tech_absences (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tech_id      uuid NOT NULL REFERENCES public.techs(id) ON DELETE CASCADE,
  absence_type text NOT NULL DEFAULT 'time_off'
               CHECK (absence_type IN ('time_off','sick','training','holiday','other')),
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz NOT NULL,
  status       text NOT NULL DEFAULT 'requested'
               CHECK (status IN ('requested','approved','denied','cancelled')),
  reason       text,
  approved_by  uuid,
  approved_at  timestamptz,
  created_by   uuid,
  updated_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tech_absences
  ADD CONSTRAINT tech_absences_time_order_check CHECK (ends_at > starts_at);
CREATE INDEX tech_absences_tech_idx ON public.tech_absences (tech_id);
CREATE INDEX tech_absences_window_idx ON public.tech_absences (starts_at, ends_at);
CREATE INDEX tech_absences_status_idx ON public.tech_absences (status);

CREATE TRIGGER tech_working_hours_set_updated_at
  BEFORE UPDATE ON public.tech_working_hours
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER tech_absences_set_updated_at
  BEFORE UPDATE ON public.tech_absences
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- §3: NEW tables → GRANTs + RLS + policies (project_jobs pattern).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tech_working_hours TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tech_working_hours TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tech_absences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tech_absences TO service_role;

ALTER TABLE public.tech_working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tech_absences ENABLE ROW LEVEL SECURITY;

CREATE POLICY tech_working_hours_select_authenticated
  ON public.tech_working_hours FOR SELECT TO authenticated USING (true);
CREATE POLICY tech_working_hours_all_authenticated
  ON public.tech_working_hours FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY tech_absences_select_authenticated
  ON public.tech_absences FOR SELECT TO authenticated USING (true);
CREATE POLICY tech_absences_all_authenticated
  ON public.tech_absences FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse):
--   BEGIN;
--   DROP TABLE IF EXISTS public.tech_absences;
--   DROP TABLE IF EXISTS public.tech_working_hours;
--   COMMIT;
