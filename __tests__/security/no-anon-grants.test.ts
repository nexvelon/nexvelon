// SEC-3 — guards that no migration hands the signed-out `anon` role a privilege
// again. Same spirit as the AUDIT-FIX-1 activity_log drift test: a mistake that
// silently widens access must fail CI, not wait to be found.
//
// WHAT IT SCANS: every numbered migration in supabase/migrations (smoke_* files
// excluded), with full-line SQL comments removed, so a commented-out reverse
// migration doesn't count. It looks for:
//   1. GRANT … TO … anon / PUBLIC on any object (tables, views, sequences,
//      functions, schemas), including inside ALTER DEFAULT PRIVILEGES;
//   2. EXECUTE format('GRANT … TO … anon / PUBLIC …') built dynamically in a DO block;
//   3. a new CREATE POLICY … TO anon (0056's two client_invitations policies are
//      the only grandfathered ones; they're inert since 0138);
// and it checks that 0138's revokes are still present.
//
// WHAT IT WOULD HAVE CAUGHT: an explicit `GRANT … TO anon` in any migration, a
// copy-pasted boilerplate that added anon, a policy written for anon like 0056's
// (which exposed every unsubmitted invitation), or someone deleting the 0138
// default-privileges revoke.
//
// WHAT IT CAN'T SEE: grants made outside migrations (the Dashboard, the SQL
// editor) and objects created by supabase_admin. The applied state is checked by
// the queries at the end of 0138.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const DIR = join(process.cwd(), "supabase/migrations");

function migrations(): { file: string; sql: string }[] {
  return readdirSync(DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort()
    .map((file) => ({
      file,
      sql: readFileSync(join(DIR, file), "utf8")
        .split("\n")
        .filter((l) => !/^\s*--/.test(l))
        .map((l) => l.replace(/--.*$/, ""))
        .join("\n"),
    }));
}

/** Every statement-ish GRANT that names anon or PUBLIC as a grantee. */
export function anonGrants(sql: string): string[] {
  const hits: string[] = [];
  const flat = sql.replace(/\s+/g, " ");
  // Literal GRANT … TO <list>; — quoted strings removed first (dynamic SQL is below).
  const unquoted = flat.replace(/'[^']*'/g, "''");
  for (const m of unquoted.matchAll(/\bGRANT\b[^;']*?\bTO\b([^;']*)/gi)) {
    if (/\b(anon|public)\b/i.test(m[1].replace(/\bpublic\./gi, ""))) hits.push(m[0].trim());
  }
  // Dynamic: EXECUTE format('GRANT … TO … anon …', …)
  for (const m of flat.matchAll(/'(\s*GRANT\b[^']*\bTO\b([^']*))'/gi)) {
    if (/\b(anon|public)\b/i.test(m[2])) hits.push(m[1].trim());
  }
  return hits;
}

export function anonPolicies(sql: string): string[] {
  const flat = sql.replace(/\s+/g, " ");
  return [...flat.matchAll(/\bCREATE POLICY\b[^;]*?\bTO\b\s+([a-z_, ]+?)\s+(USING|WITH|;)/gi)]
    .filter((m) => /\b(anon|public)\b/i.test(m[1]))
    .map((m) => m[0].trim());
}

const GRANDFATHERED_ANON_POLICY_FILES = new Set(["0056_history_delete_and_invites.sql"]);

describe("no migration grants anon (SEC-3)", () => {
  it("no migration GRANTs any privilege to anon or PUBLIC", () => {
    const offenders = migrations()
      .map(({ file, sql }) => ({ file, hits: anonGrants(sql) }))
      .filter((x) => x.hits.length > 0);
    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([]);
  });

  it("no migration after 0056 creates an RLS policy for anon or PUBLIC", () => {
    const offenders = migrations()
      .filter(({ file }) => !GRANDFATHERED_ANON_POLICY_FILES.has(file))
      .map(({ file, sql }) => ({ file, hits: anonPolicies(sql) }))
      .filter((x) => x.hits.length > 0);
    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([]);
  });

  it("0138's revokes are still present (existing objects + default privileges)", () => {
    const m = migrations().find((x) => x.file.startsWith("0138_"));
    expect(m, "0138 migration missing").toBeTruthy();
    const sql = m!.sql;
    expect(sql).toMatch(/REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;/);
    expect(sql).toMatch(/REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon/);
    for (const obj of ["TABLES FROM anon", "SEQUENCES FROM anon", "EXECUTE ON FUNCTIONS FROM anon", "EXECUTE ON FUNCTIONS FROM PUBLIC"]) {
      expect(sql).toContain(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ${obj.startsWith("EXECUTE") ? obj : `ALL ON ${obj}`};`);
    }
  });
});

describe("the detector itself", () => {
  it("catches the shapes it's meant to", () => {
    expect(anonGrants("GRANT SELECT ON public.clients TO anon;")).toHaveLength(1);
    expect(anonGrants("grant select, insert on public.x to authenticated, anon;")).toHaveLength(1);
    expect(anonGrants("GRANT EXECUTE ON FUNCTION public.f() TO PUBLIC;")).toHaveLength(1);
    expect(anonGrants("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon;")).toHaveLength(1);
    expect(anonGrants("EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', f);")).toHaveLength(1);
    expect(anonPolicies("CREATE POLICY p ON public.t FOR SELECT TO anon USING (true);")).toHaveLength(1);
  });

  it("would catch 0138's own reverse migration if someone uncommented and shipped it", () => {
    const raw = readFileSync(join(DIR, "0138_sec3_revoke_anon_grants.sql"), "utf8");
    const reverse = raw
      .slice(raw.indexOf("Reverse migration"))
      .split("\n")
      .map((l) => l.replace(/^-- ?/, ""))
      .join("\n");
    // 2 table/sequence grants, 2 dynamic function grants, 4 default-privilege grants
    expect(anonGrants(reverse).length).toBe(8);
  });

  it("doesn't flag the normal boilerplate or a revoke", () => {
    expect(anonGrants("GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices TO authenticated;")).toEqual([]);
    expect(anonGrants("GRANT SELECT ON public.devices TO service_role;")).toEqual([]);
    expect(anonGrants("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;")).toEqual([]);
    expect(anonGrants("EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);")).toEqual([]);
    expect(anonPolicies("CREATE POLICY p ON public.t FOR ALL TO authenticated USING (true);")).toEqual([]);
  });
});
