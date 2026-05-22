-- 0013_contact_phones.sql
-- CL-5c: Replace flat phone+mobile columns with phones JSONB
-- Backfills existing phone/mobile values with labels "Phone"/"Mobile" before dropping the columns.

BEGIN;

-- Add phones JSONB column with light CHECK
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS phones jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_phones_is_array
  CHECK (jsonb_typeof(phones) = 'array');

-- Backfill: convert existing phone + mobile into the new phones JSONB
-- Both labeled with sensible defaults ("Phone" / "Mobile") so existing data isn't lost
UPDATE public.contacts
SET phones =
  CASE WHEN phone IS NOT NULL AND phone != ''
       THEN jsonb_build_array(jsonb_build_object('label', 'Phone', 'number', phone))
       ELSE '[]'::jsonb END
  ||
  CASE WHEN mobile IS NOT NULL AND mobile != ''
       THEN jsonb_build_array(jsonb_build_object('label', 'Mobile', 'number', mobile))
       ELSE '[]'::jsonb END
WHERE phone IS NOT NULL OR mobile IS NOT NULL;

-- Drop the now-redundant flat columns
ALTER TABLE public.contacts DROP COLUMN IF EXISTS phone;
ALTER TABLE public.contacts DROP COLUMN IF EXISTS mobile;

COMMIT;
