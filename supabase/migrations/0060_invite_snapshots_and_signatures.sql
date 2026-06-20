BEGIN;

ALTER TABLE public.client_invitations
  ADD COLUMN IF NOT EXISTS submission_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS tc1_signature_image_path text,
  ADD COLUMN IF NOT EXISTS tc2_signature_image_path text,
  ADD COLUMN IF NOT EXISTS tc1_signed_pdf_path text,
  ADD COLUMN IF NOT EXISTS tc2_signed_pdf_path text,
  ADD COLUMN IF NOT EXISTS tier_requested text CHECK (tier_requested IS NULL OR tier_requested IN ('Platinum','Gold','Silver','Bronze'));

-- CHANGE 7 — GC / Site Supervisor on sites (in-app + invite site forms).
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS gc_name text,
  ADD COLUMN IF NOT EXISTS gc_phone text,
  ADD COLUMN IF NOT EXISTS gc_email text;

-- CHANGE 8 — the legacy inventory_vocab categories/subcategories are retired
-- (no parts were entered against them); the inventory_categories tree is now the
-- only category surface.
DELETE FROM public.inventory_vocab;

-- CHANGE 3 / 4 — private Storage buckets for drawn-signature PNGs and the
-- generated signed-T&C PDFs. Service-role only (no public access); admins read
-- via short-lived signed URLs. Idempotent.
INSERT INTO storage.buckets (id, name, public)
VALUES ('invitation-signatures', 'invitation-signatures', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('invitation-pdfs', 'invitation-pdfs', false)
ON CONFLICT (id) DO NOTHING;

COMMIT;
