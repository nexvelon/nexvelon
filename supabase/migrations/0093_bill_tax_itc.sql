-- 0093_bill_tax_itc.sql
-- FIN-7 — HST net position. Adds the two facts a remittance needs that a bill
-- didn't carry: how much of its tax is actually claimable as an input tax
-- credit, and which operating company incurred it.
--
-- §2.1: purely additive, both columns nullable. The claimable backfill sets
--     every existing row to its full tax_amount — the correct default, since a
--     normal business purchase is fully claimable. Nothing is narrowed.
-- §2.2: no derived totals stored. The net position is computed on read.
--
-- WHY claimable_tax_amount rather than assuming tax_amount IS the ITC:
-- most business purchases are fully claimable, but some are not (meals and
-- entertainment are 50%, anything with personal use is pro-rated). Storing the
-- claimable figure separately makes the common case correct by default while
-- letting the rare partial-ITC bill be adjusted DOWN, instead of silently
-- over-claiming on every remittance.
--
-- WHY vendor_bills.opco: bills attribute to a project (which carries a NOT NULL
-- opco) OR stand alone with no project at all — FIN-5's create dialog offers
-- "No PO (standalone bill)" explicitly. A standalone bill therefore has NO opco
-- path today, and Integrated Solutions and Guardian are separate corporations
-- with separate HST numbers that file separately. Without this column a
-- standalone bill's ITC could not be assigned to a return at all.

BEGIN;

-- 1. Claimable ITC. Nullable + backfilled to full tax; the API keeps it in
--    step with tax_amount from here on.
ALTER TABLE public.vendor_bills
  ADD COLUMN claimable_tax_amount numeric(14,2);

UPDATE public.vendor_bills
   SET claimable_tax_amount = tax_amount
 WHERE claimable_tax_amount IS NULL;

-- You can never claim back more tax than the vendor charged.
ALTER TABLE public.vendor_bills
  ADD CONSTRAINT vendor_bills_claimable_tax_range_check
  CHECK (
    claimable_tax_amount IS NULL
    OR (claimable_tax_amount >= 0 AND claimable_tax_amount <= tax_amount)
  );

-- 2. Opco for standalone bills. Values mirror the enum used by
--    clients.default_opco / projects.opco verbatim.
ALTER TABLE public.vendor_bills
  ADD COLUMN opco text
  CHECK (opco IS NULL OR opco IN ('integrated_solutions','guardian'));

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse, for the next operator):
--   BEGIN;
--   ALTER TABLE public.vendor_bills DROP CONSTRAINT IF EXISTS vendor_bills_claimable_tax_range_check;
--   ALTER TABLE public.vendor_bills DROP COLUMN IF EXISTS claimable_tax_amount;
--   ALTER TABLE public.vendor_bills DROP COLUMN IF EXISTS opco;
--   COMMIT;
-- Dropping claimable_tax_amount loses any partial-ITC adjustments the operator
-- made (each bill reverts to "fully claimable" by inference). Intentional and
-- called out so the loss isn't a surprise.
-- ─────────────────────────────────────────────────────────────────────────────
