import "server-only";

// PROJ2-16 — daily site log / field report per job. A dated narrative record:
// crew + hours, weather, work performed, deliveries, delays, visitors, safety,
// and photos. One log per (job, date) — a day gets one field report.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE COST BOUNDARY (§2d) — read before touching this file. The crew HOURS
// recorded here are a FIELD RECORD, not a cost input. Labour cost flows through
// labour_entries → project_cost_centers → margin (JC-1). This module NEVER
// writes to labour_entries and its hours NEVER reach the cost rollup — feeding
// both would double-count labour. If a future chunk wants the site log to
// SOURCE labour_entries, that is a deliberate, explicit conversion step; it is
// not an implicit link and must not be added here casually.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { businessDateISO } from "@/lib/format";
import { logActivity } from "@/lib/api/activity-log";
import { getJobById } from "@/lib/api/projects";
import { jobLabel } from "@/lib/api/sub-agreements";
import type {
  DbSiteLog,
  DbSiteLogCrew,
  DbSiteLogCrewInsert,
  DbSiteLogInsert,
  DbSiteLogStatus,
  DbSiteLogUpdate,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

export type SiteLogErrorCode = "not_found" | "log_exists" | "invalid_crew";

export class SiteLogError extends Error {
  code: SiteLogErrorCode;
  /** For log_exists: the id of the day that already has a log. */
  existingId?: string;
  constructor(code: SiteLogErrorCode, message: string, existingId?: string) {
    super(message);
    this.name = "SiteLogError";
    this.code = code;
    this.existingId = existingId;
  }
}

export interface SiteLogListRow extends DbSiteLog {
  crew_count: number;
  hours_total: number;
  photo_count: number;
  job_label: string | null;
}

export interface SiteLogCrewRow extends DbSiteLogCrew {
  tech_name: string | null;
  subcontractor_name: string | null;
  /** Linked party name, else the free-text person_name. */
  display_name: string;
  kind: "tech" | "subcontractor" | "other";
}

export interface SiteLogDetail extends SiteLogListRow {
  crew: SiteLogCrewRow[];
}

// ─── Reads ───────────────────────────────────────────────────────────────────

/** Crew counts + hours totals for a set of logs, in one query. */
async function crewAggregates(
  supabase: Awaited<ReturnType<typeof db>>,
  logIds: string[]
): Promise<Map<string, { count: number; hours: number }>> {
  const out = new Map<string, { count: number; hours: number }>();
  if (logIds.length === 0) return out;
  const { data, error } = await supabase
    .from("site_log_crew")
    .select("site_log_id, hours")
    .in("site_log_id", logIds);
  if (error) throw new Error(`site-logs/crewAggregates: ${error.message}`);
  for (const r of (data ?? []) as { site_log_id: string; hours: number | null }[]) {
    const cur = out.get(r.site_log_id) ?? { count: 0, hours: 0 };
    cur.count += 1;
    cur.hours = Math.round((cur.hours + Number(r.hours ?? 0)) * 100) / 100;
    out.set(r.site_log_id, cur);
  }
  return out;
}

/** Photo counts (attachments, entity_type='site_log') for a set of logs. */
async function photoCounts(
  supabase: Awaited<ReturnType<typeof db>>,
  logIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (logIds.length === 0) return out;
  const { data, error } = await supabase
    .from("attachments")
    .select("entity_id")
    .eq("entity_type", "site_log")
    .in("entity_id", logIds);
  if (error) throw new Error(`site-logs/photoCounts: ${error.message}`);
  for (const r of (data ?? []) as { entity_id: string }[]) {
    out.set(r.entity_id, (out.get(r.entity_id) ?? 0) + 1);
  }
  return out;
}

type LogJoinRow = DbSiteLog & {
  job: { job_type: string; co_number: number | null; title: string } | null;
};

function toListRow(
  r: LogJoinRow,
  agg: Map<string, { count: number; hours: number }>,
  photos: Map<string, number>
): SiteLogListRow {
  const { job, ...log } = r;
  const a = agg.get(r.id) ?? { count: 0, hours: 0 };
  return {
    ...(log as DbSiteLog),
    crew_count: a.count,
    hours_total: a.hours,
    photo_count: photos.get(r.id) ?? 0,
    job_label: jobLabel(job),
  };
}

const LOG_SELECT = "*, job:project_jobs(job_type, co_number, title)";

export async function listLogsForJob(jobId: string): Promise<SiteLogListRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("site_logs")
    .select(LOG_SELECT)
    .eq("job_id", jobId)
    .order("log_date", { ascending: false });
  if (error) throw new Error(`listLogsForJob: ${error.message}`);
  const rows = (data ?? []) as unknown as LogJoinRow[];
  const ids = rows.map((r) => r.id);
  const [agg, photos] = await Promise.all([
    crewAggregates(supabase, ids),
    photoCounts(supabase, ids),
  ]);
  return rows.map((r) => toListRow(r, agg, photos));
}

export async function getLogById(id: string): Promise<SiteLogDetail | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("site_logs")
    .select(LOG_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getLogById: ${error.message}`);
  if (!data) return null;
  const r = data as unknown as LogJoinRow;

  const { data: crewData, error: crewErr } = await supabase
    .from("site_log_crew")
    .select("*, tech:techs(name), subcontractor:subcontractors(name)")
    .eq("site_log_id", id)
    .order("created_at", { ascending: true });
  if (crewErr) throw new Error(`getLogById/crew: ${crewErr.message}`);
  const crew: SiteLogCrewRow[] = ((crewData ?? []) as unknown as (DbSiteLogCrew & {
    tech: { name: string } | null;
    subcontractor: { name: string } | null;
  })[]).map((c) => {
    const { tech, subcontractor, ...row } = c;
    const kind: "tech" | "subcontractor" | "other" = row.tech_id
      ? "tech"
      : row.subcontractor_id
        ? "subcontractor"
        : "other";
    return {
      ...(row as DbSiteLogCrew),
      tech_name: tech?.name ?? null,
      subcontractor_name: subcontractor?.name ?? null,
      display_name:
        (kind === "tech" ? tech?.name : kind === "subcontractor" ? subcontractor?.name : row.person_name) ??
        row.person_name ??
        "—",
      kind,
    };
  });

  const [agg, photos] = await Promise.all([
    crewAggregates(supabase, [id]),
    photoCounts(supabase, [id]),
  ]);
  return { ...toListRow(r, agg, photos), crew };
}

export async function getRecentLogsForProject(
  projectId: string,
  days = 7
): Promise<SiteLogListRow[]> {
  const supabase = await db();
  const from = new Date(new Date(`${businessDateISO()}T00:00:00Z`).getTime() - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const { data, error } = await supabase
    .from("site_logs")
    .select(LOG_SELECT)
    .eq("project_id", projectId)
    .gte("log_date", from)
    .order("log_date", { ascending: false });
  if (error) throw new Error(`getRecentLogsForProject: ${error.message}`);
  const rows = (data ?? []) as unknown as LogJoinRow[];
  const ids = rows.map((r) => r.id);
  const [agg, photos] = await Promise.all([
    crewAggregates(supabase, ids),
    photoCounts(supabase, ids),
  ]);
  return rows.map((r) => toListRow(r, agg, photos));
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export interface CreateLogInput {
  jobId: string;
  logDate?: string;
  weather?: string | null;
  temperatureC?: number | null;
  workPerformed?: string | null;
  delaysIssues?: string | null;
  materialsReceived?: string | null;
  visitors?: string | null;
  safetyNotes?: string | null;
  actorId?: string | null;
}

export async function createLog(input: CreateLogInput): Promise<DbSiteLog> {
  const supabase = await db();
  const job = await getJobById(input.jobId);
  if (!job) throw new SiteLogError("not_found", "Job not found.");
  const logDate = input.logDate ?? businessDateISO();

  // One log per (job, date) — if the day already has one, tell the caller which
  // so the UI can open it instead of erroring blindly.
  const { data: existing, error: exErr } = await supabase
    .from("site_logs")
    .select("id")
    .eq("job_id", input.jobId)
    .eq("log_date", logDate)
    .maybeSingle();
  if (exErr) throw new Error(`createLog/dupcheck: ${exErr.message}`);
  if (existing) {
    throw new SiteLogError(
      "log_exists",
      "A site log already exists for this job on this date.",
      (existing as { id: string }).id
    );
  }

  const payload: DbSiteLogInsert = {
    project_id: job.project_id,
    job_id: input.jobId,
    log_date: logDate,
    weather: input.weather ?? null,
    temperature_c: input.temperatureC ?? null,
    work_performed: input.workPerformed ?? null,
    delays_issues: input.delaysIssues ?? null,
    materials_received: input.materialsReceived ?? null,
    visitors: input.visitors ?? null,
    safety_notes: input.safetyNotes ?? null,
    status: "draft",
    created_by: input.actorId ?? null,
    updated_by: input.actorId ?? null,
  };
  const { data, error } = await supabase
    .from("site_logs")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(`createLog: ${error.message}`);
  return data as DbSiteLog;
}

export interface UpdateLogPatch {
  logDate?: string;
  weather?: string | null;
  temperatureC?: number | null;
  workPerformed?: string | null;
  delaysIssues?: string | null;
  materialsReceived?: string | null;
  visitors?: string | null;
  safetyNotes?: string | null;
}

/**
 * Edit a log. Both draft and submitted logs are editable (a field report can be
 * corrected). Editing a SUBMITTED log records an "edited after submission" trail
 * via a best-effort activity-log entry under the project (activity_log has no
 * 'site_log' entity_type; the log_date rides in the payload). §2.8 — the trail
 * never blocks the edit.
 */
export async function updateLog(
  id: string,
  patch: UpdateLogPatch,
  actorId: string | null
): Promise<DbSiteLog> {
  const supabase = await db();
  const { data: cur, error: cErr } = await supabase
    .from("site_logs")
    .select("id, project_id, status, log_date")
    .eq("id", id)
    .maybeSingle();
  if (cErr) throw new Error(`updateLog/load: ${cErr.message}`);
  if (!cur) throw new SiteLogError("not_found", "Site log not found.");
  const before = cur as { project_id: string; status: DbSiteLogStatus; log_date: string };

  const update: DbSiteLogUpdate = { updated_by: actorId };
  if (patch.logDate !== undefined) update.log_date = patch.logDate;
  if (patch.weather !== undefined) update.weather = patch.weather;
  if (patch.temperatureC !== undefined) update.temperature_c = patch.temperatureC;
  if (patch.workPerformed !== undefined) update.work_performed = patch.workPerformed;
  if (patch.delaysIssues !== undefined) update.delays_issues = patch.delaysIssues;
  if (patch.materialsReceived !== undefined) update.materials_received = patch.materialsReceived;
  if (patch.visitors !== undefined) update.visitors = patch.visitors;
  if (patch.safetyNotes !== undefined) update.safety_notes = patch.safetyNotes;

  const { data, error } = await supabase
    .from("site_logs")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateLog: ${error.message}`);

  if (before.status === "submitted") {
    try {
      await logActivity("project", before.project_id, "update", {
        site_log_edited_after_submit: { from: null, to: before.log_date },
      });
    } catch {
      /* best-effort trail */
    }
  }
  return data as DbSiteLog;
}

export async function submitLog(id: string, actorId: string | null): Promise<DbSiteLog> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("site_logs")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      submitted_by: actorId,
      updated_by: actorId,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`submitLog: ${error.message}`);
  return data as DbSiteLog;
}

export async function deleteLog(id: string): Promise<boolean> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("site_logs")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`deleteLog: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

// ─── Crew ────────────────────────────────────────────────────────────────────

export interface AddCrewInput {
  siteLogId: string;
  techId?: string | null;
  subcontractorId?: string | null;
  personName?: string | null;
  hours?: number | null;
  notes?: string | null;
}

function assertCrewParty(input: {
  techId?: string | null;
  subcontractorId?: string | null;
  personName?: string | null;
}): void {
  const hasTech = !!input.techId;
  const hasSub = !!input.subcontractorId;
  if (hasTech && hasSub) {
    throw new SiteLogError("invalid_crew", "A crew line links one person, not both a tech and a sub.");
  }
  if (!hasTech && !hasSub && !input.personName?.trim()) {
    throw new SiteLogError("invalid_crew", "A crew line needs a person — pick someone or type a name.");
  }
}

export async function addCrew(input: AddCrewInput): Promise<DbSiteLogCrew> {
  assertCrewParty(input);
  const supabase = await db();
  const payload: DbSiteLogCrewInsert = {
    site_log_id: input.siteLogId,
    tech_id: input.techId ?? null,
    subcontractor_id: input.subcontractorId ?? null,
    // Only keep a free-text name when there's no linked party.
    person_name: input.techId || input.subcontractorId ? null : (input.personName?.trim() || null),
    hours: input.hours ?? null,
    notes: input.notes ?? null,
  };
  const { data, error } = await supabase
    .from("site_log_crew")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(`addCrew: ${error.message}`);
  return data as DbSiteLogCrew;
}

export async function updateCrew(
  id: string,
  patch: { hours?: number | null; notes?: string | null }
): Promise<DbSiteLogCrew> {
  const supabase = await db();
  const update: Record<string, unknown> = {};
  if (patch.hours !== undefined) update.hours = patch.hours;
  if (patch.notes !== undefined) update.notes = patch.notes;
  const { data, error } = await supabase
    .from("site_log_crew")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateCrew: ${error.message}`);
  return data as DbSiteLogCrew;
}

export async function removeCrew(id: string): Promise<boolean> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("site_log_crew")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`removeCrew: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
