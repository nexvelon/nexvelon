import "server-only";

// JC-1 — server-only labour API (public.labour_entries, migration 0054).
// Cookie-aware server client so RLS is enforced. Writes are gated by
// financials:edit at the action layer (projects/labour-actions.ts).
//
// Snapshot model: tech_name and cost_rate are frozen onto the row at entry
// time, and amount (= hours * cost_rate) is persisted, so later tech renames /
// rate changes never rewrite history and per-cost-center rollups are a cheap
// sum of stored amounts.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/profile";
import { round2 } from "@/lib/quote-helpers";
import type { DbLabourEntry, DbProfile, DbTech } from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

// A labour entry enriched for display: the actor names are resolved from
// profiles so the UI doesn't have to.
export interface LabourEntryView extends DbLabourEntry {
  created_by_name: string | null;
  updated_by_name: string | null;
}

function displayName(p: DbProfile): string {
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return p.display_name?.trim() || full || p.email;
}

/** The cost-center ids belonging to a project. */
async function costCenterIdsForProject(
  supabase: Awaited<ReturnType<typeof db>>,
  projectId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("project_cost_centers")
    .select("id")
    .eq("project_id", projectId);
  if (error) throw new Error(`labour/costCenters: ${error.message}`);
  return (data ?? []).map((r) => (r as { id: string }).id);
}

/**
 * Labour entries for a project, grouped by cost_center_id and ordered newest
 * worked_on first within each group. created_by/updated_by are resolved to
 * display names. Cost centers with no labour are simply absent from the map.
 */
export async function listLabourEntriesForProject(
  projectId: string
): Promise<Record<string, LabourEntryView[]>> {
  const supabase = await db();
  const ccIds = await costCenterIdsForProject(supabase, projectId);
  if (ccIds.length === 0) return {};

  const { data, error } = await supabase
    .from("labour_entries")
    .select("*")
    .in("cost_center_id", ccIds)
    .order("worked_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listLabourEntriesForProject: ${error.message}`);
  const rows = (data ?? []) as DbLabourEntry[];

  // Resolve actor names in one round-trip.
  const uids = Array.from(
    new Set(
      rows.flatMap((r) => [r.created_by, r.updated_by]).filter(Boolean) as string[]
    )
  );
  const names = new Map<string, string>();
  if (uids.length > 0) {
    const { data: profs, error: pErr } = await supabase
      .from("profiles")
      .select("id, email, first_name, last_name, display_name")
      .in("id", uids);
    if (pErr) throw new Error(`listLabourEntriesForProject/names: ${pErr.message}`);
    for (const p of (profs ?? []) as DbProfile[]) names.set(p.id, displayName(p));
  }

  const grouped: Record<string, LabourEntryView[]> = {};
  for (const r of rows) {
    const view: LabourEntryView = {
      ...r,
      created_by_name: r.created_by ? names.get(r.created_by) ?? null : null,
      updated_by_name: r.updated_by ? names.get(r.updated_by) ?? null : null,
    };
    (grouped[r.cost_center_id] ??= []).push(view);
  }
  return grouped;
}

/**
 * Add a labour entry against a cost center. Resolves + snapshots tech_name from
 * the tech's current name, defaults cost_rate to the tech's default_cost_rate
 * when omitted, and persists amount = hours * cost_rate. Refuses to log against
 * an inactive tech (the Add Labour Select only offers active techs, but we
 * enforce it server-side too).
 */
export async function addLabourEntry(input: {
  cost_center_id: string;
  tech_id?: string;
  hours: number;
  cost_rate?: number;
  worked_on?: string;
  note?: string | null;
}): Promise<DbLabourEntry> {
  const supabase = await db();
  const me = await getCurrentProfile();

  if (!input.tech_id) throw new Error("A tech is required.");

  const { data: techRow, error: techErr } = await supabase
    .from("techs")
    .select("*")
    .eq("id", input.tech_id)
    .maybeSingle();
  if (techErr) throw new Error(`addLabourEntry/tech: ${techErr.message}`);
  const tech = techRow as DbTech | null;
  if (!tech) throw new Error("That tech no longer exists.");
  if (!tech.is_active)
    throw new Error("Can't log labour against an inactive tech.");

  const hours = Number(input.hours);
  if (!Number.isFinite(hours) || hours <= 0)
    throw new Error("Hours must be greater than 0.");

  const rawRate =
    input.cost_rate !== undefined && input.cost_rate !== null
      ? Number(input.cost_rate)
      : tech.default_cost_rate;
  if (rawRate === null || rawRate === undefined)
    throw new Error("Enter a cost rate (this tech has no default rate).");
  const cost_rate = Number(rawRate);
  if (!Number.isFinite(cost_rate) || cost_rate < 0)
    throw new Error("Cost rate can't be negative.");

  const amount = round2(hours * cost_rate);

  const insert: Record<string, unknown> = {
    cost_center_id: input.cost_center_id,
    tech_id: tech.id,
    tech_name: tech.name, // snapshot
    hours,
    cost_rate,
    amount,
    note: input.note?.trim() ? input.note.trim() : null,
    created_by: me?.id ?? null,
    updated_by: me?.id ?? null,
  };
  if (input.worked_on) insert.worked_on = input.worked_on;

  const { data, error } = await supabase
    .from("labour_entries")
    .insert(insert)
    .select("*")
    .single();
  if (error) throw new Error(`addLabourEntry: ${error.message}`);
  return data as DbLabourEntry;
}

/**
 * Update a labour entry. Recomputes amount whenever hours or cost_rate change.
 *
 * tech_name is intentionally NOT re-derived when tech_id changes — it is a
 * historical snapshot. To change the displayed name, pass tech_name explicitly;
 * passing only tech_id relinks the row without touching the snapshot.
 */
export async function updateLabourEntry(
  id: string,
  patch: {
    tech_id?: string | null;
    tech_name?: string;
    hours?: number;
    cost_rate?: number;
    worked_on?: string;
    note?: string | null;
  }
): Promise<DbLabourEntry> {
  const supabase = await db();
  const me = await getCurrentProfile();

  const { data: curRow, error: curErr } = await supabase
    .from("labour_entries")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (curErr) throw new Error(`updateLabourEntry/load: ${curErr.message}`);
  const cur = curRow as DbLabourEntry | null;
  if (!cur) throw new Error("That labour entry no longer exists.");

  const fields: Record<string, unknown> = { updated_by: me?.id ?? null };

  if (patch.tech_id !== undefined) fields.tech_id = patch.tech_id;
  if (patch.tech_name !== undefined) fields.tech_name = patch.tech_name; // explicit only
  if (patch.worked_on !== undefined) fields.worked_on = patch.worked_on;
  if (patch.note !== undefined)
    fields.note = patch.note?.trim() ? patch.note.trim() : null;

  let nextHours = cur.hours;
  let nextRate = cur.cost_rate;
  let recompute = false;
  if (patch.hours !== undefined) {
    nextHours = Number(patch.hours);
    if (!Number.isFinite(nextHours) || nextHours <= 0)
      throw new Error("Hours must be greater than 0.");
    fields.hours = nextHours;
    recompute = true;
  }
  if (patch.cost_rate !== undefined) {
    nextRate = Number(patch.cost_rate);
    if (!Number.isFinite(nextRate) || nextRate < 0)
      throw new Error("Cost rate can't be negative.");
    fields.cost_rate = nextRate;
    recompute = true;
  }
  if (recompute) fields.amount = round2(nextHours * nextRate);

  const { data, error } = await supabase
    .from("labour_entries")
    .update(fields)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateLabourEntry: ${error.message}`);
  return data as DbLabourEntry;
}

/** Delete a labour entry. */
export async function deleteLabourEntry(id: string): Promise<boolean> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("labour_entries")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`deleteLabourEntry: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/**
 * Total labour cost per cost center for a project, as { [cost_center_id]: sum }.
 * A cheap sum of the persisted `amount` snapshots. Cost centers with no labour
 * are absent (callers treat missing as 0).
 */
export async function sumLabourCostByCostCenter(
  projectId: string
): Promise<Record<string, number>> {
  const supabase = await db();
  const ccIds = await costCenterIdsForProject(supabase, projectId);
  if (ccIds.length === 0) return {};

  const { data, error } = await supabase
    .from("labour_entries")
    .select("cost_center_id, amount")
    .in("cost_center_id", ccIds);
  if (error) throw new Error(`sumLabourCostByCostCenter: ${error.message}`);

  const totals: Record<string, number> = {};
  for (const r of (data ?? []) as { cost_center_id: string; amount: number }[]) {
    totals[r.cost_center_id] = round2(
      (totals[r.cost_center_id] ?? 0) + Number(r.amount ?? 0)
    );
  }
  return totals;
}
