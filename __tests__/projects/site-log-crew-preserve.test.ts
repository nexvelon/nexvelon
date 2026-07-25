// PROJ2-17/21 batch — the 0106 fix for the 0105 site_log_crew tech-delete gap.
//
// The fix is pure DB (BEFORE DELETE triggers that backfill person_name before
// the FK nulls it), so its runtime behaviour is exercised by
// smoke_0106_site_log_crew_name_preserve.sql against a live database — a chain
// mock can't run a Postgres trigger. This JS test is the STRUCTURAL regression
// guard: it asserts migration 0106 actually wires both triggers to preserve the
// name, so the fix can't silently disappear.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/0106_site_log_crew_name_preserve.sql"),
  "utf8"
);

describe("0106 — site_log_crew name preservation", () => {
  it("defines BEFORE DELETE triggers on techs AND subcontractors", () => {
    expect(sql).toMatch(/CREATE TRIGGER\s+techs_preserve_crew_name\s+BEFORE DELETE ON public\.techs/i);
    expect(sql).toMatch(/CREATE TRIGGER\s+subcontractors_preserve_crew_name\s+BEFORE DELETE ON public\.subcontractors/i);
  });

  it("backfills site_log_crew.person_name from the deleted party's name, only where NULL", () => {
    // The UPDATE must target person_name, COALESCE with the party's name, and
    // guard on person_name IS NULL so it never overwrites a real free-text name.
    expect(sql).toMatch(/UPDATE public\.site_log_crew/i);
    expect(sql).toMatch(/SET person_name = COALESCE\(person_name,/i);
    expect(sql).toMatch(/WHERE tech_id = OLD\.id AND person_name IS NULL/i);
    expect(sql).toMatch(/WHERE subcontractor_id = OLD\.id AND person_name IS NULL/i);
  });
});
