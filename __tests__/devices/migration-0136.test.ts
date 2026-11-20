// DEVREG-1 — static checks on migration 0136: the §3 boilerplate on every new
// table, no anon grant, no narrow CHECK on the type vocabulary (§1), and the label
// uniqueness rule (3g).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/0136_devreg1_device_register.sql"), "utf8");
const live = sql
  .split("\n")
  .filter((l) => !/^\s*--/.test(l))
  .join("\n");

describe("migration 0136", () => {
  for (const t of ["device_types", "device_floors", "devices"]) {
    it(`${t}: created, granted to authenticated + service_role, RLS on, with policies`, () => {
      expect(live).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t} \\(`));
      expect(live).toContain(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${t} TO authenticated;`);
      expect(live).toContain(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${t} TO service_role;`);
      expect(live).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
      expect(live).toMatch(new RegExp(`CREATE POLICY ${t}_\\w+\\s+ON public\\.${t}`));
    });
  }

  it("never grants to anon", () => {
    expect(live).not.toMatch(/TO anon/i);
  });

  it("puts no CHECK on the type id or system lists (they grow)", () => {
    const typesBlock = live.slice(live.indexOf("CREATE TABLE IF NOT EXISTS public.device_types"), live.indexOf("CREATE TABLE IF NOT EXISTS public.device_floors"));
    expect(typesBlock).not.toMatch(/CHECK/);
    expect(live).not.toMatch(/type_id[^,\n]*CHECK/);
    expect(live).not.toMatch(/source[^,\n]*CHECK/);
  });

  it("enforces label uniqueness per site + building among live devices, case-insensitively", () => {
    expect(live).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS devices_site_building_label_uniq\s+ON public\.devices \(site_id, coalesce\(building_key, ''\), lower\(label\)\)\s+WHERE deleted_at IS NULL AND label IS NOT NULL;/);
  });

  it("scale columns are nullable (an unknown scale stays unknown)", () => {
    for (const c of ["plan_origin_x_m", "plan_origin_z_m", "plan_width_m", "plan_depth_m", "plan_aspect"]) {
      expect(live).toMatch(new RegExp(`\\b${c} numeric,`));
    }
  });

  it("devices soft-delete and keep both source snapshots", () => {
    const devBlock = live.slice(live.indexOf("CREATE TABLE IF NOT EXISTS public.devices"));
    expect(devBlock).toMatch(/deleted_at timestamptz/);
    expect(devBlock).toMatch(/design jsonb/);
    expect(devBlock).toMatch(/as_built jsonb/);
  });

  it("a site with devices can't be hard-deleted (RESTRICT)", () => {
    const devBlock = live.slice(live.indexOf("CREATE TABLE IF NOT EXISTS public.devices"));
    expect(devBlock).toMatch(/site_id uuid NOT NULL REFERENCES public\.sites\(id\) ON DELETE RESTRICT,/);
  });
});
