BEGIN;

ALTER TABLE public.client_invitations
  ADD COLUMN IF NOT EXISTS client_form_pdf_path text,
  ADD COLUMN IF NOT EXISTS site_form_pdf_path text;

COMMIT;
