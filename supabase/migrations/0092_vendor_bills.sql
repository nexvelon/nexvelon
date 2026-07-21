-- 0092_vendor_bills.sql
-- FIN-5 — vendor bills (AP). The AP mirror of the AR stack: a vendor_bill is
-- the analog of an invoice, bill_payments the analog of invoice_payments.
--
-- §3: both tables are NEW → explicit GRANTs + RLS + policies (0082 pattern).
-- §2.2 (derive, don't store): a bill's balance is total − Σ bill_payments. No
--     amount_paid column, exactly as FIN-2 did for invoices.
-- §2.1: purely additive. Nothing existing is narrowed or rewritten — in
--     particular the cost rollup's `spent` leg is NOT touched (see below).
--
-- WHY bills do not feed `spent` (the double-count that would otherwise happen):
-- receivePurchaseOrderLines() calls receiveStock() with the PO line's unit_cost
-- (lib/api/purchase-orders.ts), so receiving a PO already writes that cost onto
-- inventory_stock — which is precisely what the rollup's `materials`/`spent`
-- leg sums. A bill for the same PO covers the same physical goods. Adding it to
-- `spent` would count those materials twice. FIN-5 therefore surfaces
-- billed_cost as its own supplementary leg alongside po_committed, leaving the
-- inventory+labour definition of `spent` untouched. Choosing bills-vs-inventory
-- as the single canonical actual is a real decision, deferred deliberately.
--
-- Bills are HEADER-level in v1 (subtotal / tax / total entered directly). Most
-- vendor bills are reconciled against a PO in total; line-level 3-way match is
-- overkill for a solo operator. Line-itemised bills are FIN-5b if ever needed.

BEGIN;

CREATE TABLE public.vendor_bills (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id         uuid NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  -- Nullable: a bill may be PO-linked or standalone (freight, one-off supply).
  -- SET NULL so deleting a PO never destroys the bill's financial record.
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  project_id        uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  job_id            uuid REFERENCES public.project_jobs(id) ON DELETE SET NULL,
  bill_number       text NOT NULL,          -- the VENDOR's invoice number
  bill_date         date NOT NULL,
  due_date          date,
  subtotal          numeric(14,2) NOT NULL DEFAULT 0,
  tax_amount        numeric(14,2) NOT NULL DEFAULT 0,
  total             numeric(14,2) NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'received'
                    CHECK (status IN ('received','partially_paid','paid','void')),
  notes             text,
  created_by        uuid,
  updated_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vendor_bills_vendor_id_idx  ON public.vendor_bills (vendor_id);
CREATE INDEX vendor_bills_po_id_idx      ON public.vendor_bills (purchase_order_id);
CREATE INDEX vendor_bills_job_id_idx     ON public.vendor_bills (job_id);
CREATE INDEX vendor_bills_project_id_idx ON public.vendor_bills (project_id);

-- Same shape guard 0084 put on invoices + POs: a Job implies a Project.
ALTER TABLE public.vendor_bills
  ADD CONSTRAINT vendor_bills_job_requires_project_check
  CHECK (job_id IS NULL OR project_id IS NOT NULL);

CREATE TRIGGER vendor_bills_set_updated_at
  BEFORE UPDATE ON public.vendor_bills
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_bills TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_bills TO service_role;

ALTER TABLE public.vendor_bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendor_bills_select_authenticated
  ON public.vendor_bills FOR SELECT
  TO authenticated USING (true);

CREATE POLICY vendor_bills_all_authenticated
  ON public.vendor_bills FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- ─── Bill payments (AP mirror of invoice_payments) ───────────────────────────
-- RESTRICT: a bill that has been paid against cannot be deleted out from under
-- its ledger. Voiding is the soft path (and is itself blocked once paid).
CREATE TABLE public.bill_payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id     uuid NOT NULL REFERENCES public.vendor_bills(id) ON DELETE RESTRICT,
  amount      numeric(14,2) NOT NULL CHECK (amount > 0),
  method      text NOT NULL CHECK (method IN
                ('cheque','eft','e_transfer','credit_card','cash','other')),
  paid_at     date NOT NULL,
  reference   text,
  notes       text,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bill_payments_bill_id_idx ON public.bill_payments (bill_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bill_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bill_payments TO service_role;

ALTER TABLE public.bill_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY bill_payments_select_authenticated
  ON public.bill_payments FOR SELECT
  TO authenticated USING (true);

CREATE POLICY bill_payments_all_authenticated
  ON public.bill_payments FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse, for the next operator):
--   BEGIN;
--   DROP TABLE IF EXISTS public.bill_payments;   -- payments first (RESTRICT)
--   DROP TABLE IF EXISTS public.vendor_bills;
--   COMMIT;
-- Nothing outside these two tables changed, so the reversal is self-contained.
-- ─────────────────────────────────────────────────────────────────────────────
