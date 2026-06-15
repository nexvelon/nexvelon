-- 0040_quote_audit_quote_id_text.sql
-- AUDIT-FIX: widen quote_audit_log.quote_id from uuid → text. Quote ids are
-- app-minted TEXT ("q-xxxxxxxx", quotes.id is text per 0027), but 0038 declared
-- this column uuid — so every logQuoteAuditEvent insert raised
-- "invalid input syntax for type uuid" and was swallowed by the best-effort
-- try/catch in the writer. Result: NO audit events ever persisted.
--
-- Mirrors the 0036 attachments.entity_id uuid→text fix. quote_id is not FK'd, so
-- this is a safe widen (§2.1 — never narrow). The table is empty (all inserts
-- failed), so the USING cast touches no rows; the quote_audit_log_quote_idx
-- index rebuilds automatically on the new type.
--
-- Applied via the Dashboard SQL Editor.

BEGIN;
ALTER TABLE public.quote_audit_log
  ALTER COLUMN quote_id TYPE text USING quote_id::text;
COMMIT;
