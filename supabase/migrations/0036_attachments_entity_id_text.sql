-- 0036_attachments_entity_id_text.sql
-- ATTACH-2: widen attachments.entity_id from uuid → text so the table can key
-- off app-minted text ids too (quotes use "q-xxxxxxxx" text ids, not UUIDs).
-- entity_id is not FK'd, so this is a safe widen (§2.1 — never narrow). Existing
-- uuid values cast cleanly to text; the (entity_type, entity_id) indexes are
-- rebuilt automatically on the new type.
--
-- Applied via the Dashboard SQL Editor.

BEGIN;
ALTER TABLE public.attachments
  ALTER COLUMN entity_id TYPE text USING entity_id::text;
COMMIT;
