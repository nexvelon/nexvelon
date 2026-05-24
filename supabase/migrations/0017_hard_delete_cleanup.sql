-- 0017_hard_delete_cleanup.sql
-- FIX-1: hard-delete model — clean up existing soft-deleted rows so the
-- DB matches the new model. Going forward, deletes are immediate hard
-- DELETE statements via lib/api/clients.ts (deleteClient / deleteSite /
-- deleteContact).
--
-- The deleted_at + deleted_by columns REMAIN in the schema (§2.1
-- past-data preservation) but go dormant — new writes never touch them
-- and reads never filter on them. Drop in a future migration if/when
-- the team confirms no historical query needs them.
--
-- Cascade chain:
--   * DELETE FROM clients WHERE deleted_at IS NOT NULL
--     → cascades to sites (FK client_id ON DELETE CASCADE, 0001)
--     → cascades to contacts (FK client_id ON DELETE CASCADE, 0001)
--   * Any remaining soft-deleted sites get caught below
--     → their contacts have site_id flipped to NULL via FK SET NULL (0001)
--   * Any remaining soft-deleted contacts get caught last
--
-- Activity-log rows for the soon-to-be-hard-deleted entities SURVIVE per
-- ACT-1 design (no FK on activity_log.entity_id).

BEGIN;

-- 1. Cascade-delete the clients that were soft-deleted (their sites and
--    contacts go with them).
DELETE FROM public.clients WHERE deleted_at IS NOT NULL;

-- 2. Any directly-soft-deleted sites that weren't already cascaded.
DELETE FROM public.sites WHERE deleted_at IS NOT NULL;

-- 3. Any directly-soft-deleted contacts that weren't already cascaded.
DELETE FROM public.contacts WHERE deleted_at IS NOT NULL;

COMMIT;
