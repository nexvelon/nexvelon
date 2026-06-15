-- 0041_projects_schema.sql
-- PROJ-1: first real tables of the projects domain.
--   • projects             — one per converted quote (opco inherited from the
--                            quote template; originating_quote_id is TEXT since
--                            quotes.id is text "q-…").
--   • project_quotes        — links a project to its quotes with a role
--                            (original / change order); text quote FK.
--   • project_cost_centers  — the project's cost centers (PJ-numbered), seeded
--                            from the originating quote's sections.
-- client_id / site_id are uuid (clients/sites PKs); quote FKs are TEXT.
-- RLS: authenticated SELECT + write (mirrors the clients/quotes posture);
-- updated_at via the shared handle_updated_at() trigger.
--
-- Applied via the Dashboard SQL Editor.

BEGIN;
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_number text NOT NULL UNIQUE,
  opco text NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  site_id uuid REFERENCES public.sites(id) ON DELETE RESTRICT,
  title text,
  status text NOT NULL DEFAULT 'active',
  originating_quote_id text REFERENCES public.quotes(id) ON DELETE SET NULL,
  created_by uuid, updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_client_idx ON public.projects(client_id);
CREATE INDEX IF NOT EXISTS projects_site_idx   ON public.projects(site_id);

CREATE TABLE IF NOT EXISTS public.project_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  quote_id   text NOT NULL REFERENCES public.quotes(id)   ON DELETE RESTRICT,
  role text NOT NULL DEFAULT 'original',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, quote_id)
);
CREATE INDEX IF NOT EXISTS project_quotes_project_idx ON public.project_quotes(project_id);

CREATE TABLE IF NOT EXISTS public.project_cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  cc_number text NOT NULL,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_cost_centers_project_idx ON public.project_cost_centers(project_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.projects;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.project_cost_centers;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.project_cost_centers FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.projects             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_quotes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_cost_centers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projects_select_authenticated ON public.projects;
CREATE POLICY projects_select_authenticated ON public.projects FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS projects_write_authenticated ON public.projects;
CREATE POLICY projects_write_authenticated ON public.projects FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS project_quotes_select_authenticated ON public.project_quotes;
CREATE POLICY project_quotes_select_authenticated ON public.project_quotes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS project_quotes_write_authenticated ON public.project_quotes;
CREATE POLICY project_quotes_write_authenticated ON public.project_quotes FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS pcc_select_authenticated ON public.project_cost_centers;
CREATE POLICY pcc_select_authenticated ON public.project_cost_centers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS pcc_write_authenticated ON public.project_cost_centers;
CREATE POLICY pcc_write_authenticated ON public.project_cost_centers FOR ALL TO authenticated USING (true) WITH CHECK (true);
COMMIT;
