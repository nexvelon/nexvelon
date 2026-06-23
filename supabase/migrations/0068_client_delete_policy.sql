BEGIN;

-- POLISH-43 — fix "Client not found" on delete from the clients list.
-- Root cause: 0002_auth_and_users_schema.sql replaced the original FOR ALL
-- policy on public.clients with SELECT/INSERT/UPDATE-only policies ("no DELETE
-- policy (rows are soft-deleted via deleted_at)"). FIX-1 later switched clients
-- to a HARD delete model, but the delete still runs through the cookie-aware
-- session client, so RLS silently filtered every DELETE to 0 rows — surfaced to
-- the admin as "Client not found." Add the missing DELETE policy, mirroring the
-- table's existing authenticated CRUD posture (per-role scoping lands later).
DROP POLICY IF EXISTS clients_delete_authenticated ON public.clients;
CREATE POLICY clients_delete_authenticated
  ON public.clients FOR DELETE TO authenticated USING (true);

COMMIT;
