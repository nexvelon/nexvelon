-- 0095_subcontractors.sql
-- SUB-1 — the subcontractor as a PAYABLE BUSINESS ENTITY (the company/person you
-- send work to, who invoices you, whose WSIB expires, who gets a T5018).
--
-- This is deliberately SEPARATE from the existing "Subcontractor" login persona
-- (profiles.role = 'Subcontractor' / employee_type = 'Subcontractor', migration
-- 0002) — that is a user who signs into the ERP; this is a business partner most
-- of whom will never have a login. An optional link between the two may come in
-- a later chunk; they are NOT merged here.
--
-- D1 (Sprint-7 audit): standalone entity, NOT a vendors flag. A subcontractor
--     carries a nullable vendor_id so its bills still ride the FIN-5 stack
--     (vendor_bills → billed_cost → per-job P&L) without smearing sub-only
--     columns (labour rate, compliance, T5018) across every parts supplier.
--
-- §3: NEW table → GRANTs + RLS + policies (project_jobs pattern, migration 0082).
-- §2.1: additive; nothing existing is touched. vendor_id is ON DELETE SET NULL
--     so deleting a vendor never destroys the subcontractor record.

BEGIN;

CREATE TABLE public.subcontractors (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,            -- company or individual (display)
  legal_name          text,                     -- if different — for T5018
  trade               text,                     -- 'Electrical','Low-voltage',
                                                -- 'Monitoring','Drywall' … free text v1
  contact_name        text,
  email               text,
  phone               text,
  address_line1       text,
  address_line2       text,
  city                text,
  province            text,
  postal_code         text,
  country             text DEFAULT 'Canada',
  business_number     text,                     -- CRA BN — needed for T5018
  gst_hst_number      text,
  default_labour_rate numeric(12,2),            -- their charge-out rate
  payment_terms       text,                     -- free text v1 (mirrors vendors)
  status              text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','inactive','do_not_use')),
  -- The billing hop (FIN-5). Nullable; SET NULL on vendor delete.
  vendor_id           uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  notes               text,
  created_by          uuid,
  updated_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX subcontractors_status_idx    ON public.subcontractors (status);
CREATE INDEX subcontractors_vendor_id_idx ON public.subcontractors (vendor_id);

-- Case-insensitive uniqueness on name to stop "Acme" / "acme" duplicates.
CREATE UNIQUE INDEX subcontractors_name_unique
  ON public.subcontractors (lower(name));

CREATE TRIGGER subcontractors_set_updated_at
  BEFORE UPDATE ON public.subcontractors
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- §3 GRANTs + RLS + policies.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subcontractors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subcontractors TO service_role;

ALTER TABLE public.subcontractors ENABLE ROW LEVEL SECURITY;

CREATE POLICY subcontractors_select_authenticated
  ON public.subcontractors FOR SELECT
  TO authenticated USING (true);

CREATE POLICY subcontractors_all_authenticated
  ON public.subcontractors FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse, for the next operator):
--   BEGIN;
--   DROP TABLE IF EXISTS public.subcontractors;
--   COMMIT;
-- Self-contained: nothing outside this table changed. Later chunks (compliance
-- docs, agreements, assignments) will add FKs with ON DELETE RESTRICT that then
-- guard subcontractor deletion; none exist yet, so a subcontractor is freely
-- deletable in SUB-1.
-- ─────────────────────────────────────────────────────────────────────────────
