-- 0097_bill_subcontractor_link.sql
-- SUB-4 — link a vendor bill to the subcontractor it pays, so subcontractor
-- labour becomes a REAL cost that reduces job margin as its own leg (the D2
-- decision from the Sprint 7 audit) — WITHOUT disturbing the materials
-- billed_cost leg that FIN-5/FIN-8 deliberately kept OUT of margin.
--
-- THE PARTITION this column creates (see lib/api/project-cost-rollup.ts):
--   billed_cost := Σ vendor_bills.subtotal WHERE subcontractor_id IS NULL
--   sub_labour  := Σ vendor_bills.subtotal WHERE subcontractor_id IS NOT NULL
-- Every non-void bill lands in EXACTLY ONE leg (subcontractor_id is either NULL
-- or not), so the two legs are mutually exclusive and total — no double count,
-- and the P&L reconciles. materials bills stay supplementary (memo); sub bills
-- become canonical cost (in margin).
--
-- WHY an explicit column rather than the SUB-1 vendor hop: a subcontractor's
-- vendor_id link is OPTIONAL, and one vendor row could in principle serve both
-- a material-supply and a sub-labour role. Matching bill.vendor_id against
-- subcontractor.vendor_id would therefore be ambiguous. An explicit FK makes
-- the partition unambiguous and indexable.
--
-- §2.1 additive: the column is nullable with NO backfill. Every existing bill
-- is a material/supplier bill and correctly stays subcontractor_id IS NULL — we
-- do not retro-classify historical data (§2.2).
--
-- ON DELETE RESTRICT: a subcontractor with booked cost against it can't be
-- silently deleted out from under its bills (mirrors the SUB-1 note that SUB-4
-- would add a restricting FK).

BEGIN;

ALTER TABLE public.vendor_bills
  ADD COLUMN subcontractor_id uuid
    REFERENCES public.subcontractors(id) ON DELETE RESTRICT;

CREATE INDEX vendor_bills_subcontractor_id_idx
  ON public.vendor_bills (subcontractor_id);

COMMIT;
