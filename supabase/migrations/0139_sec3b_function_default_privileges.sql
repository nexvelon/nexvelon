-- 0139_sec3b_function_default_privileges.sql
-- SEC-3 follow-up: stop NEW functions defaulting to EXECUTE for PUBLIC, and so
-- for `anon`.
--
-- WHY 0138 WASN'T ENOUGH FOR FUNCTIONS. Postgres per-schema default privileges
-- (ALTER DEFAULT PRIVILEGES … IN SCHEMA public) can only ADD to the global
-- defaults; they can't remove anything. The built-in global default for functions
-- grants EXECUTE to PUBLIC, and anon inherits from PUBLIC. So 0138's schema-level
-- "REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC" was a no-op, and a throwaway function
-- created after 0138 was executable by anon. Tables and sequences were not
-- affected: their global default grants nothing to PUBLIC, and the throwaway
-- table correctly had no anon grant.
--
-- THE FIX. Remove PUBLIC from the GLOBAL default for functions created by
-- `postgres` (the role migrations run as). No IN SCHEMA, deliberately.
--
-- WHAT IT AFFECTS.
--   • New functions postgres creates in `public`: they get EXECUTE only from the
--     public-schema defaults, i.e. postgres, authenticated and service_role. anon
--     and PUBLIC get nothing.
--   • New functions postgres creates in ANY other schema also stop getting PUBLIC.
--     In practice postgres creates functions only in `public` (Supabase's own
--     schemas are owned by supabase_admin / supabase_auth_admin /
--     supabase_storage_admin, whose defaults this doesn't touch). The storage
--     schema's own postgres defaults still grant anon, authenticated and
--     service_role explicitly, so they're unchanged there.
--   • Supabase system roles (authenticator, supabase_auth_admin,
--     supabase_storage_admin) no longer get EXECUTE on NEW public functions via
--     PUBLIC. If a future function must be callable by one of them (e.g. an auth
--     hook), the migration that creates it grants it explicitly.
--
-- WHAT IT DOES NOT TOUCH. Existing functions (0138 handled them), any table or
-- sequence, any RLS policy, authenticated / service_role, application code.

BEGIN;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMIT;

-- ── Checks (run after applying) ───────────────────────────────────────────────
--   -- A global (schema-less) default for postgres functions now exists, without
--   -- PUBLIC (expect 1 row, acl has no "=X/" entry)
--   SELECT defaclacl FROM pg_default_acl
--     WHERE defaclnamespace = 0 AND pg_get_userbyid(defaclrole)='postgres' AND defaclobjtype='f';
--   Positive control: CREATE FUNCTION public.x() …; anon EXECUTE must be false,
--   authenticated and service_role true; then DROP it.

-- ── Reverse migration ─────────────────────────────────────────────────────────
-- BEGIN;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
-- COMMIT;
