// AUDIT-FIX-1 — guards that the activity_log entity_type CHECK, the TS single
// source (ACTIVITY_ENTITY_TYPES), and the entity_type strings application code
// actually passes can never drift apart again. Drift is exactly what silently
// broke audit writes for 'inventory' / 'attachment'.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ACTIVITY_ENTITY_TYPES } from "@/lib/types/database";

const MIGRATIONS_DIR = join(process.cwd(), "supabase/migrations");

/** The entity_type list from the LATEST migration that (re)defines the CHECK,
 *  ignoring commented-out rollback blocks. */
function latestCheckValues(): string[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && !f.startsWith("smoke_") && /^\d{4}_/.test(f))
    .sort();
  let values: string[] | null = null;
  for (const f of files) {
    const stripped = readFileSync(join(MIGRATIONS_DIR, f), "utf8")
      .split("\n")
      .filter((l) => !/^\s*--/.test(l)) // drop full-line SQL comments (rollback block)
      .join("\n");
    const m = stripped.match(
      /ADD CONSTRAINT activity_log_entity_type_check\s+CHECK\s*\(\s*entity_type\s+IN\s*\(([^)]*)\)/i
    );
    if (m) values = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  }
  if (!values) throw new Error("no activity_log_entity_type_check found in migrations");
  return values;
}

/** Every entity_type string application code passes to activity_log —
 *  logActivity("X", …) and direct `.from("activity_log").insert({ entity_type:
 *  "X" })` — across app/, lib/, components/. The direct-insert scan is scoped to
 *  a window after a `.from("activity_log")` so it does NOT pick up other tables'
 *  entity_type columns (e.g. attachments uses entity_type: "folder"). */
function entityTypesUsedInCode(): Set<string> {
  const roots = ["app", "lib", "components"];
  const used = new Set<string>();
  for (const root of roots) {
    const dir = join(process.cwd(), root);
    const entries = readdirSync(dir, { recursive: true }) as string[];
    for (const rel of entries) {
      if (!/\.(ts|tsx)$/.test(rel)) continue;
      if (rel.includes("activity-log.ts")) continue; // the helper's own signature
      const src = readFileSync(join(dir, rel), "utf8");
      // logActivity("X", ...) — always an activity_log write.
      for (const m of src.matchAll(/logActivity\(\s*"([^"]+)"/g)) used.add(m[1]);
      // direct activity_log inserts: entity_type literal shortly after the .from().
      for (const fm of src.matchAll(/\.from\(\s*"activity_log"\s*\)/g)) {
        const window = src.slice(fm.index ?? 0, (fm.index ?? 0) + 400);
        const em = window.match(/entity_type:\s*"([^"]+)"/);
        if (em) used.add(em[1]);
      }
    }
  }
  return used;
}

describe("activity_log entity_type — no drift", () => {
  it("the migration CHECK exactly matches ACTIVITY_ENTITY_TYPES (the single source)", () => {
    expect([...latestCheckValues()].sort()).toEqual([...ACTIVITY_ENTITY_TYPES].sort());
  });

  it("every entity_type used in application code is allowed by the CHECK", () => {
    const allowed = new Set(latestCheckValues());
    const used = entityTypesUsedInCode();
    const rejected = [...used].filter((t) => !allowed.has(t));
    expect(rejected, `entity_types used in code but NOT in the CHECK: ${rejected.join(", ")}`).toEqual([]);
  });

  it("includes the two values that regressed ('inventory', 'attachment')", () => {
    const allowed = new Set(latestCheckValues());
    expect(allowed.has("inventory")).toBe(true);
    expect(allowed.has("attachment")).toBe(true);
  });

  it("a made-up entity_type is NOT allowed (the CHECK would reject it in-DB)", () => {
    expect(new Set(latestCheckValues()).has("not_a_real_kind")).toBe(false);
  });
});

// ── logActivity best-effort semantics (Step 4) ──────────────────────────────
const h = vi.hoisted(() => ({ insertError: null as { message: string } | null, throwOnClient: false }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (h.throwOnClient) throw new Error("client boom");
    return {
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
      from: () => ({ insert: async () => ({ error: h.insertError }) }),
    };
  }),
}));

import { logActivity } from "@/lib/api/activity-log";

describe("logActivity is best-effort but never silent", () => {
  beforeEach(() => {
    h.insertError = null;
    h.throwOnClient = false;
    vi.restoreAllMocks();
  });

  it("a denied insert logs an error with caller context and does NOT throw", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    h.insertError = { message: "new row violates row-level security policy" };
    await expect(logActivity("inventory", "prod-1", "update", {})).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(1);
    const logged = String(spy.mock.calls[0][0]);
    expect(logged).toContain("inventory"); // entity_type
    expect(logged).toContain("prod-1"); // entity_id
    expect(logged).toContain("update"); // action
  });

  it("a thrown client is swallowed (logged, no throw)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    h.throwOnClient = true;
    await expect(logActivity("project", "p-1", "create", {})).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("a successful insert logs nothing", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    h.insertError = null;
    await logActivity("client", "c-1", "create", {});
    expect(spy).not.toHaveBeenCalled();
  });
});
