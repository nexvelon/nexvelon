// DEVREG-1B — Riser Studio's type catalog: the 62 ids are seeded exactly as given
// (no rename, no re-order), the migration and the code agree row for row, every id
// round-trips unchanged, and a device of a known type no longer reads "unmatched".

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { RISER_TYPE_CATALOG, RISER_TYPE_IDS } from "@/lib/devices/riser-catalog";
import { fieldsFromRiser, toRiserDevice, type RiserDevice } from "@/lib/devices/model";
import { parseCsv, planImport } from "@/lib/devices/csv-import";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/0137_devreg1b_riser_type_catalog.sql"), "utf8");
const live = sql
  .split("\n")
  .filter((l) => !/^\s*--/.test(l))
  .join("\n");

/** The seeded VALUES tuples, in file order. */
function seededRows() {
  const re = /\('((?:[^']|'')*)', '((?:[^']|'')*)', '([^']*)', '([^']*)', ([0-9.]+), (NULL|'[^']*'), '([^']*)', (\d+), 'riser_studio'\)/g;
  return [...live.matchAll(re)].map((m) => ({
    id: m[1],
    name: m[2].replace(/''/g, "'"),
    system: m[3],
    labelPrefix: m[4],
    mountHeightM: Number(m[5]),
    cable: m[6] === "NULL" ? null : m[6].slice(1, -1),
    kind: m[7],
    sortOrder: Number(m[8]),
  }));
}

// The ids exactly as Jay extracted them from Riser Studio, in catalog order.
const EXPECTED_IDS = [
  "dome", "bullet", "turret", "ptz", "fish", "multi", "lpr", "nvr", "mon",
  "reader", "kpreader", "mobreader", "strike", "mag", "dc", "rex", "pte", "ado", "pb",
  "elevrdr", "elevio", "rim", "psu", "gate", "turnstile", "dgp", "typA", "typB", "typC", "doorleaf",
  "entry", "suite", "ipds", "guard", "icm",
  "kp", "pir", "gb", "idc", "duress", "siren", "zexp", "ipanel", "typD",
  "facp", "stu", "smoke", "heat", "pull", "hs", "mm", "ann",
  "rack", "wrack", "sw", "ws", "ups", "mc",
  "epanel", "rcpt", "jb", "xfmr",
];

describe("the catalog", () => {
  it("has exactly the 62 ids given, in the given order, unchanged (case included)", () => {
    expect(RISER_TYPE_CATALOG.map((t) => t.id)).toEqual(EXPECTED_IDS);
    expect(RISER_TYPE_IDS.size).toBe(62);
  });

  it("counts per system match Riser Studio", () => {
    const by: Record<string, number> = {};
    for (const t of RISER_TYPE_CATALOG) by[t.system] = (by[t.system] ?? 0) + 1;
    expect(by).toEqual({ cctv: 9, access: 21, intercom: 5, intrusion: 9, fire: 8, network: 6, electrical: 4 });
  });

  it("marks exactly the typicals and the door leaf as door groups", () => {
    expect(RISER_TYPE_CATALOG.filter((t) => t.kind === "door_group").map((t) => t.id)).toEqual(["typA", "typB", "typC", "doorleaf", "typD"]);
  });

  it("keeps a missing cable as null (not '—'), and 0 m mount heights as 0", () => {
    const nvr = RISER_TYPE_CATALOG.find((t) => t.id === "nvr")!;
    expect(nvr.cable).toBeNull();
    expect(RISER_TYPE_CATALOG.some((t) => t.cable === "—")).toBe(false);
    expect(RISER_TYPE_CATALOG.find((t) => t.id === "rack")!.mountHeightM).toBe(0);
    expect(RISER_TYPE_CATALOG.find((t) => t.id === "mag")!.mountHeightM).toBe(2.05);
  });
});

describe("migration 0137 matches the catalog row for row", () => {
  const rows = seededRows();

  it("seeds 62 rows, the same ids in the same order, with sort_order 1..62", () => {
    expect(rows).toHaveLength(62);
    expect(rows.map((r) => r.id)).toEqual(EXPECTED_IDS);
    expect(rows.map((r) => r.sortOrder)).toEqual(EXPECTED_IDS.map((_, i) => i + 1));
  });

  it("every column agrees with lib/devices/riser-catalog.ts", () => {
    rows.forEach((r, i) => {
      const t = RISER_TYPE_CATALOG[i];
      expect({ id: r.id, name: r.name, system: r.system, labelPrefix: r.labelPrefix, mountHeightM: r.mountHeightM, cable: r.cable, kind: r.kind }).toEqual({ ...t });
    });
  });

  it("is data, not a CHECK (§1), additive, and never overwrites an existing row", () => {
    expect(live).not.toMatch(/CHECK/);
    expect(live).not.toMatch(/DROP|DELETE|UPDATE public/i);
    expect(live).toMatch(/ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'device'/);
    expect(live).toMatch(/ON CONFLICT \(id\) DO NOTHING;/);
  });

  it("seeds no pricing (the catalog carries none)", () => {
    expect(live).not.toMatch(/price|cost/i);
  });
});

describe("every type id round-trips unchanged", () => {
  it("through a Riser Studio device record and back", () => {
    for (const t of RISER_TYPE_CATALOG) {
      const rec: RiserDevice = { id: `dev_${t.id}`, t: t.id, lab: `${t.labelPrefix}-01`, mh: t.mountHeightM };
      const back = toRiserDevice({ ...fieldsFromRiser(rec), design: rec as Record<string, unknown>, external_id: rec.id });
      expect(back.t).toBe(t.id);
      expect(back).toEqual(rec);
    }
  });

  it("through a CSV import, and every known type now reads matched", () => {
    const csv = ["label,type,building", ...RISER_TYPE_CATALOG.map((t, i) => `${t.labelPrefix}-${String(i + 1).padStart(3, "0")},${t.id},B1`)].join("\n");
    const plan = planImport({
      rows: parseCsv(csv),
      siteId: "s1",
      existing: [],
      floors: [],
      knownTypeIds: new Set(RISER_TYPE_IDS),
      doorGroupTypeIds: new Set(RISER_TYPE_CATALOG.filter((t) => t.kind === "door_group").map((t) => t.id)),
    });
    expect(plan.counts).toEqual({ create: 62, update: 0, unchanged: 0, error: 0 });
    expect(plan.rows.map((r) => r.changes.type_id)).toEqual(EXPECTED_IDS);
    expect(plan.rows.filter((r) => r.typeMatched !== true)).toEqual([]);
    expect(plan.rows.some((r) => r.warnings.some((w) => /unmatched/.test(w)))).toBe(false);
  });

  it("flags a door-group type in an import as a door group, not a single device", () => {
    const plan = planImport({
      rows: parseCsv("label,type\nD-001,typA\nRDR-01,reader"),
      siteId: "s1",
      existing: [],
      floors: [],
      knownTypeIds: new Set(RISER_TYPE_IDS),
      doorGroupTypeIds: new Set(["typA", "typB", "typC", "typD", "doorleaf"]),
    });
    expect(plan.rows[0].warnings.join(" ")).toMatch(/door group/);
    expect(plan.rows[1].warnings).toEqual([]);
  });

  it("an id that differs only by case is NOT treated as the same type", () => {
    const plan = planImport({ rows: parseCsv("label,type\nD-1,typa"), siteId: "s1", existing: [], floors: [], knownTypeIds: new Set(RISER_TYPE_IDS) });
    expect(plan.rows[0].typeMatched).toBe(false);
    expect(plan.rows[0].changes.type_id).toBe("typa");
  });
});
