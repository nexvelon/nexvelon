-- 0138_sec3_revoke_anon_grants.sql
-- SEC-3 — remove the signed-out (`anon`) role's privileges in `public`, and stop
-- new objects receiving them.
--
-- WHY. Supabase's default privileges gave `anon` full table privileges on every
-- `public` table (119 tables × 7 = 833) and EXECUTE on every function, so RLS was
-- the only barrier. The Step 1 inventory found two LIVE exposures behind it:
--   • client_invitations: 0056's anon policies allow any UNSUBMITTED row (not just
--     the requested token), so with the public API key all 28 open invitations,
--     tokens included, were readable and updatable. The app never uses this path
--     (it reads invitations via the service role).
--   • SECURITY DEFINER functions callable by anon over the API with no caller
--     check: hard_delete_client, hard_delete_site (wipe a client/site and its
--     quotes, invoices, projects) and next_invoice_seq (burns invoice numbers).
--     The app calls these only via the service role.
-- With the grants removed, a missing or mistaken RLS policy fails closed.
--
-- WHAT NOTHING USES. Every unauthenticated route (quote portal, invite flow, cron,
-- auth pages) reads through the service-role client or the auth API. The only
-- code that touches a public table as anon is the org-theme read in the root
-- layout and the invite tier-text read (both company_settings); RLS already
-- returns anon nothing there, so they fall back to defaults today and will fall
-- back to the same defaults (their errors are caught) after this.
--
-- WHAT THIS DOES NOT TOUCH.
--   • `authenticated` and `service_role` keep every privilege they have. Functions
--     are re-granted to them explicitly because their EXECUTE partly came from
--     PUBLIC, which is revoked here.
--   • No RLS policy is changed (the two anon policies on client_invitations stay,
--     and become inert because anon no longer has the table privilege).
--   • No application code, no permission key.
--   • The 188 btree_gist extension functions in `public` (owned by supabase_admin;
--     postgres can neither change them nor supabase_admin's default privileges).
--     They're index-support functions that read no data.
--
-- OWNER OF NEW OBJECTS. Every `public` table and our 20 functions are owned by
-- `postgres`, which is the role migrations run as, so 2b alters the default
-- privileges FOR ROLE postgres. Objects created by supabase_admin (e.g. an
-- extension install) are outside this and are noted above.

BEGIN;

-- ── 2a. Existing objects ──────────────────────────────────────────────────────
-- Tables and views (ALL TABLES covers both), then sequences.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Functions owned by postgres (20, none an extension member). anon's EXECUTE
-- comes both directly and through PUBLIC, so both are revoked.
--   • authenticated and service_role already hold an explicit EXECUTE grant on
--     every one of them; it's re-stated (a no-op) so their access is unchanged.
--   • Supabase's system roles (authenticator, supabase_auth_admin,
--     supabase_storage_admin) reached these only through PUBLIC. Where PUBLIC had
--     EXECUTE, they're granted it explicitly so nothing they could run changes.
--     Where PUBLIC did not (hard_delete_client / hard_delete_site, revoked from
--     PUBLIC by 0069/0070), nothing is added.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS f,
           coalesce(p.proacl::text, '') ~ '(^|[{,])=X/' AS public_had_execute
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND pg_get_userbyid(p.proowner) = 'postgres'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.f);
    IF r.public_had_execute THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticator, supabase_auth_admin, supabase_storage_admin', r.f);
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.f);
  END LOOP;
END $$;

-- ── 2b. Future objects created by postgres in public ─────────────────────────
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMIT;

-- ── Checks (run after applying, every line should match its comment) ─────────
--   -- anon table/view privileges in public (expect 0)
--   SELECT count(*) FROM information_schema.role_table_grants
--     WHERE table_schema='public' AND grantee='anon';
--   -- anon sequence privileges in public (expect 0)
--   SELECT count(*) FROM information_schema.role_usage_grants
--     WHERE object_schema='public' AND grantee='anon' AND object_type='SEQUENCE';
--   -- anon EXECUTE on our (postgres-owned, non-extension) functions (expect 0)
--   SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND pg_get_userbyid(p.proowner)='postgres'
--       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')
--       AND has_function_privilege('anon', p.oid, 'EXECUTE');
--   -- default privileges for postgres in public no longer mention anon (expect 0 rows)
--   SELECT defaclobjtype, defaclacl FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace
--     WHERE n.nspname='public' AND pg_get_userbyid(d.defaclrole)='postgres'
--       AND defaclacl::text LIKE '%anon=%';
--   -- authenticated / service_role unchanged (expect 833 table privileges each,
--   -- 208 executable functions each)
--   Positive control: CREATE TABLE in a rolled-back transaction, then check anon
--   has no privilege on it.

-- ── Reverse migration (restores the previous grants, if something needs them) ─
-- BEGIN;
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
-- DO $$
-- DECLARE f regprocedure;
-- BEGIN
--   FOR f IN
--     SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public' AND pg_get_userbyid(p.proowner) = 'postgres'
--       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
--   LOOP
--     EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', f);
--     -- PUBLIC never had the two hard-delete functions (0069/0070), so do not add it.
--     IF f::text NOT IN ('hard_delete_client(uuid)', 'hard_delete_site(uuid)') THEN
--       EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', f);
--     END IF;
--   END LOOP;
-- END $$;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
-- COMMIT;
