-- 0043_invoicing.sql
-- INVOICE-1: invoicing foundation.
--   • project_cost_centers.contract_value — the section's contracted value
--     (seeded from the originating quote section total) a draw pulls a % of.
--   • invoice_counters + next_invoice_seq(opco) — a per-entity gapless counter;
--     a sequence is minted only on ISSUE, so deleted drafts never burn a number.
--   • invoices — header: per-entity number (nullable until issued, unique),
--     project/client/site, tax (default ON 13%, per-invoice exempt) and an
--     optional holdback rate; computed money columns.
--   • invoice_lines — flexible lines: manual or sourced from a cost center at a
--     full/partial % (progress/deposit draw); each editable + unlinkable.
-- RLS: authenticated SELECT + write (mirrors the projects/quotes posture);
-- updated_at via the shared handle_updated_at() trigger.
--
-- Applied via the Dashboard SQL Editor.

BEGIN;

ALTER TABLE public.project_cost_centers
  ADD COLUMN IF NOT EXISTS contract_value numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.invoice_counters (
  opco text PRIMARY KEY,
  last_seq integer NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.next_invoice_seq(p_opco text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_seq integer;
BEGIN
  INSERT INTO public.invoice_counters(opco, last_seq) VALUES (p_opco, 1)
  ON CONFLICT (opco) DO UPDATE SET last_seq = public.invoice_counters.last_seq + 1
  RETURNING last_seq INTO v_seq;
  RETURN v_seq;
END; $$;

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE,
  opco text NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  site_id uuid REFERENCES public.sites(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft',
  issue_date date, due_date date,
  currency text NOT NULL DEFAULT 'CAD',
  tax_rate numeric NOT NULL DEFAULT 13,
  tax_exempt boolean NOT NULL DEFAULT false,
  holdback_rate numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  holdback_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  amount_due numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid, updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoices_project_idx ON public.invoices(project_id);
CREATE INDEX IF NOT EXISTS invoices_client_idx  ON public.invoices(client_id);

CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  source_type text NOT NULL DEFAULT 'manual',     -- 'manual' | 'cost_center'
  source_id uuid,                                  -- project_cost_centers.id when sourced
  source_pct numeric,                              -- e.g. 65 for a 65% draw
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoice_lines_invoice_idx ON public.invoice_lines(invoice_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.invoices;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.invoice_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_counters_select_authenticated ON public.invoice_counters;
CREATE POLICY invoice_counters_select_authenticated ON public.invoice_counters FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS invoices_select_authenticated ON public.invoices;
CREATE POLICY invoices_select_authenticated ON public.invoices FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS invoices_write_authenticated ON public.invoices;
CREATE POLICY invoices_write_authenticated ON public.invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS invoice_lines_select_authenticated ON public.invoice_lines;
CREATE POLICY invoice_lines_select_authenticated ON public.invoice_lines FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS invoice_lines_write_authenticated ON public.invoice_lines;
CREATE POLICY invoice_lines_write_authenticated ON public.invoice_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
