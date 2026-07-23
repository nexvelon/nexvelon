-- 0096_subcontractor_compliance_docs.sql
-- SUB-2 — compliance documents for a subcontractor: WSIB clearance, insurance
-- certificates, licences and qualifications, each with issue/expiry dates and
-- an uploaded file. The module's real differentiator — this is what SUB-5/SUB-6
-- will hard-block against so a lapsed-WSIB or uninsured sub can't be put on a
-- work order or a site.
--
-- §2.2 (derive, don't store): there is NO status column. A document's validity
--     (valid / expiring-soon / expired) is a function of (expiry_date, today),
--     computed on read — a stored status goes stale silently the day it lapses,
--     which for compliance is the one failure mode you can't accept.
-- §3: NEW table → GRANTs + RLS + policies (project_jobs pattern).
-- §2.1: additive. attachment_id is a soft link to the existing attachments
--     table (the file rides the same signed-URL flow as every other upload);
--     ON DELETE SET NULL so removing the blob never destroys the doc's dates.
-- The doc row itself CASCADEs when its subcontractor is deleted.

BEGIN;

CREATE TABLE public.subcontractor_compliance_docs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id  uuid NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  doc_type          text NOT NULL CHECK (doc_type IN (
                      'wsib_clearance',
                      'liability_insurance',
                      'auto_insurance',
                      'license',
                      'qualification',
                      'agreement',        -- signed master agreement scan
                      'other')),
  title             text,                  -- free label, e.g. "ESA licence"
  issuer            text,                  -- WSIB, insurer name, etc.
  reference_number  text,                  -- policy / certificate number
  issued_date       date,
  expiry_date       date,                  -- NULL = does not expire
  coverage_amount   numeric(14,2),         -- for insurance certificates
  attachment_id     uuid REFERENCES public.attachments(id) ON DELETE SET NULL,
  notes             text,
  created_by        uuid,
  updated_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX subcontractor_compliance_docs_sub_idx
  ON public.subcontractor_compliance_docs (subcontractor_id);
CREATE INDEX subcontractor_compliance_docs_expiry_idx
  ON public.subcontractor_compliance_docs (expiry_date);
CREATE INDEX subcontractor_compliance_docs_type_idx
  ON public.subcontractor_compliance_docs (doc_type);

-- Sanity: an expiry date cannot precede the issue date.
ALTER TABLE public.subcontractor_compliance_docs
  ADD CONSTRAINT subcontractor_compliance_docs_date_order_check
  CHECK (issued_date IS NULL OR expiry_date IS NULL
         OR expiry_date >= issued_date);

CREATE TRIGGER subcontractor_compliance_docs_set_updated_at
  BEFORE UPDATE ON public.subcontractor_compliance_docs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subcontractor_compliance_docs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subcontractor_compliance_docs TO service_role;

ALTER TABLE public.subcontractor_compliance_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY subcontractor_compliance_docs_select_authenticated
  ON public.subcontractor_compliance_docs FOR SELECT
  TO authenticated USING (true);

CREATE POLICY subcontractor_compliance_docs_all_authenticated
  ON public.subcontractor_compliance_docs FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse, for the next operator):
--   BEGIN;
--   DROP TABLE IF EXISTS public.subcontractor_compliance_docs;
--   COMMIT;
-- Self-contained. The linked attachments rows/objects survive (SET NULL is one
-- way — dropping this table doesn't touch attachments); clean them up
-- separately if the whole feature is being reverted.
-- ─────────────────────────────────────────────────────────────────────────────
