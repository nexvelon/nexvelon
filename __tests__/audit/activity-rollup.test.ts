// AUD-1 — child events roll up to a parent timeline, and rows survive parent
// deletion (schema guard).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  inserted: vi.fn(),
  orArg: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "actor-1" } } }) },
    from: () => ({
      insert: async (row: unknown) => {
        h.inserted(row);
        return { error: null };
      },
      select: () => ({
        or: (clause: string) => {
          h.orArg(clause);
          return {
            // AUD-2 — listActivityPage pages via .range(); keep .limit for any
            // legacy caller so this mock covers both chains.
            order: () => ({
              range: async () => ({ data: [], error: null }),
              limit: async () => ({ data: [], error: null }),
            }),
          };
        },
      }),
    }),
  })),
}));

import { logActivity, listActivityFor } from "@/lib/api/activity-log";

beforeEach(() => {
  h.inserted.mockClear();
  h.orArg.mockClear();
});

describe("logActivity roll-up + labels", () => {
  it("writes parent_type / parent_id / entity_label when a context is given", async () => {
    await logActivity(
      "attachment",
      "att-1",
      "create",
      { file: { from: null, to: "Site survey.pdf" } },
      { parentType: "client", parentId: "client-9", entityLabel: "Site survey.pdf" }
    );
    expect(h.inserted).toHaveBeenCalledTimes(1);
    expect(h.inserted.mock.calls[0][0]).toMatchObject({
      entity_type: "attachment",
      entity_id: "att-1",
      parent_type: "client",
      parent_id: "client-9",
      entity_label: "Site survey.pdf",
      actor_id: "actor-1",
    });
  });

  it("defaults the roll-up columns to null for a plain call", async () => {
    await logActivity("client", "c1", "update", {});
    expect(h.inserted.mock.calls[0][0]).toMatchObject({
      parent_type: null,
      parent_id: null,
      entity_label: null,
    });
  });
});

describe("listActivityFor includes descendants (parent roll-up)", () => {
  it("queries own rows OR rows whose parent matches", async () => {
    await listActivityFor("client", "client-9");
    expect(h.orArg).toHaveBeenCalledTimes(1);
    const clause = h.orArg.mock.calls[0][0] as string;
    expect(clause).toContain("entity_type.eq.client");
    expect(clause).toContain("entity_id.eq.client-9");
    expect(clause).toContain("parent_type.eq.client");
    expect(clause).toContain("parent_id.eq.client-9");
  });
});

describe("survival — migration 0119 adds no foreign key", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/0119_activity_log_parent_rollup.sql"),
    "utf8"
  );
  it("adds the four roll-up/label columns", () => {
    for (const col of ["parent_type", "parent_id", "entity_label", "parent_label"]) {
      expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}\\b`));
    }
  });
  it("introduces NO foreign key (rows must survive parent deletion)", () => {
    // strip comment lines, then assert no REFERENCES clause on the new columns
    const active = sql
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    expect(active).not.toMatch(/REFERENCES/i);
  });
});
