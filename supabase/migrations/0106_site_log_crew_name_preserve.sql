-- 0106_site_log_crew_name_preserve.sql
-- Fix the 0105 gap the smoke exposed: a site_log_crew row with tech_id set and
-- NO person_name becomes CHECK-invalid the moment the tech is deleted — the
-- ON DELETE SET NULL FK nulls tech_id, leaving a row with neither a party FK nor
-- a name, which site_log_crew_party_check forbids. Net effect: a tech (or sub)
-- named in ANY site log couldn't be deleted at all.
--
-- Fix: BEFORE DELETE triggers on techs and subcontractors that PRESERVE the name
-- onto the affected crew rows first (only where person_name is still NULL), so
-- when the FK subsequently nulls, the row still identifies someone. The crew
-- line keeps a durable snapshot of who was on site — which is exactly what a
-- field record should do.
--
-- §2.1 additive; no data change beyond backfilling names at delete time.

BEGIN;

CREATE OR REPLACE FUNCTION public.preserve_site_log_crew_tech_name()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.site_log_crew
     SET person_name = COALESCE(person_name,
           (SELECT name FROM public.techs WHERE id = OLD.id))
   WHERE tech_id = OLD.id AND person_name IS NULL;
  RETURN OLD;
END; $$;

CREATE TRIGGER techs_preserve_crew_name
  BEFORE DELETE ON public.techs
  FOR EACH ROW EXECUTE FUNCTION public.preserve_site_log_crew_tech_name();

CREATE OR REPLACE FUNCTION public.preserve_site_log_crew_sub_name()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.site_log_crew
     SET person_name = COALESCE(person_name,
           (SELECT name FROM public.subcontractors WHERE id = OLD.id))
   WHERE subcontractor_id = OLD.id AND person_name IS NULL;
  RETURN OLD;
END; $$;

CREATE TRIGGER subcontractors_preserve_crew_name
  BEFORE DELETE ON public.subcontractors
  FOR EACH ROW EXECUTE FUNCTION public.preserve_site_log_crew_sub_name();

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse, for the next operator):
--   BEGIN;
--   DROP TRIGGER IF EXISTS subcontractors_preserve_crew_name ON public.subcontractors;
--   DROP TRIGGER IF EXISTS techs_preserve_crew_name ON public.techs;
--   DROP FUNCTION IF EXISTS public.preserve_site_log_crew_sub_name();
--   DROP FUNCTION IF EXISTS public.preserve_site_log_crew_tech_name();
--   COMMIT;
-- Reverting re-opens the 0105 delete gap; only roll back with 0105.
-- ─────────────────────────────────────────────────────────────────────────────
