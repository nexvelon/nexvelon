-- 0048_custody.sql
-- CUSTODY-1 (Batch D3): chain-of-custody lifecycle for SERIALIZED units.
--   custody_status moves a unit through in_stock → delivered → installed (or
--   returned / lost / consumed) on top of the D1 location (warehouse/truck/job).
--   delivered_at / installed_at / lost_at: when each transition happened.
--   custody_proof_attachment_id: OPTIONAL signed delivery proof (attachments.id).
--   last_known_label: snapshot of where a LOST unit was last seen, so
--   responsibility survives even though the unit is gone.
-- Custody applies to serialized units only (enforced in the app layer).
--
-- Applied via the Dashboard SQL Editor.

BEGIN;
ALTER TABLE public.inventory_stock
  ADD COLUMN IF NOT EXISTS custody_status text NOT NULL DEFAULT 'in_stock',  -- in_stock|delivered|installed|returned|lost|consumed
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS installed_at timestamptz,
  ADD COLUMN IF NOT EXISTS lost_at timestamptz,
  ADD COLUMN IF NOT EXISTS custody_proof_attachment_id uuid,
  ADD COLUMN IF NOT EXISTS last_known_label text;
COMMIT;
