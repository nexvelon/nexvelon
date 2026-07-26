-- SCHED-4 (migration 0113) — the append-only schedule change log + the single
-- canonical booking→labour cost-seam link. Completes Sprint 3's scheduling arc.
--
-- THE COST SEAM: a booking is a PLAN and never becomes cost automatically. The
-- ONLY path to cost is the deliberate, manual convertBookingToLabour, which
-- writes ONE labour_entry and stamps the link below. Single-conversion is
-- enforced in the API (converted_labour_entry_id IS NULL required); the FK's
-- ON DELETE SET NULL means deleting the labour_entry frees the booking to be
-- re-converted (a mistaken conversion is fixable). The labour_entry also carries
-- a provenance note ("From booking SVC-…") so a human always sees where the cost
-- came from — no silent double-count with manual labour or site logs.

BEGIN;

-- Append-only schedule change log (immutable, §2.2). Every booking mutation
-- writes one row; there is NO update/delete policy (see §3 below).
CREATE TABLE public.schedule_audit (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_assignment_id uuid REFERENCES public.schedule_assignments(id) ON DELETE SET NULL,
  schedule_job_id        uuid REFERENCES public.schedule_jobs(id) ON DELETE SET NULL,
  tech_id                uuid REFERENCES public.techs(id) ON DELETE SET NULL,
  action                 text NOT NULL
                         CHECK (action IN ('created','moved','cancelled','completed','converted_to_labour','unconverted')),
  from_starts_at         timestamptz,
  from_ends_at           timestamptz,
  to_starts_at           timestamptz,
  to_ends_at             timestamptz,
  from_tech_id           uuid,
  to_tech_id             uuid,
  detail                 jsonb,
  actor_id               uuid,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX schedule_audit_assignment_idx ON public.schedule_audit (schedule_assignment_id);
CREATE INDEX schedule_audit_job_idx ON public.schedule_audit (schedule_job_id);
CREATE INDEX schedule_audit_created_idx ON public.schedule_audit (created_at);
-- No updated_at, no trigger — append-only, immutable.

-- The cost-seam link (single canonical link, per the SCHED-4 audit 2b). The
-- provenance note on the labour_entry gives human-visible traceability; this FK
-- gives the machine-enforced single-conversion guard.
ALTER TABLE public.schedule_assignments
  ADD COLUMN converted_labour_entry_id uuid
    REFERENCES public.labour_entries(id) ON DELETE SET NULL;

-- §3: schedule_audit is APPEND-ONLY → GRANT SELECT + INSERT to authenticated
-- (no UPDATE/DELETE), full to service_role. RLS with a select + insert policy
-- only; the absence of an update/delete policy makes the log immutable to app
-- callers. (schedule_assignments already has grants; the new column inherits.)
GRANT SELECT, INSERT ON public.schedule_audit TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_audit TO service_role;

ALTER TABLE public.schedule_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY schedule_audit_select_authenticated
  ON public.schedule_audit FOR SELECT TO authenticated USING (true);
CREATE POLICY schedule_audit_insert_authenticated
  ON public.schedule_audit FOR INSERT TO authenticated WITH CHECK (true);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse):
--   BEGIN;
--   ALTER TABLE public.schedule_assignments DROP COLUMN IF EXISTS converted_labour_entry_id;
--   DROP TABLE IF EXISTS public.schedule_audit;
--   COMMIT;
