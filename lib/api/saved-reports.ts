import "server-only";

// REP-5 — saved reports + schedules: data access (cookie-aware session client,
// RLS). The action layer decides WHO may do what (see app/(app)/reports/saved-actions.ts);
// delivery itself is lib/reports/run-scheduled.ts.
//
// §1: a saved report is SOFT-deleted (deleted_at) — its run + delivery history is
// the audit trail of what was emailed to whom, so it is never hard-deleted.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import type { ReportFormat } from "@/lib/reports/export";
import type { SavedReportKey } from "@/lib/reports/catalog";
import type { SavedReportParams } from "@/lib/reports/saved-params";
import type { ReportCadence } from "@/lib/reports/schedule";

async function db() {
  return createSupabaseServerClient();
}

export interface DbSavedReport {
  id: string;
  name: string;
  report_key: SavedReportKey;
  params: SavedReportParams;
  format: ReportFormat;
  owner_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DbReportSchedule {
  id: string;
  saved_report_id: string;
  cadence: ReportCadence;
  day_of_week: number | null;
  day_of_month: number | null;
  start_date: string;
  active: boolean;
  paused_reason: string | null;
  paused_at: string | null;
}

export interface DbReportRun {
  id: string;
  saved_report_id: string;
  schedule_id: string | null;
  run_date: string;
  trigger: "schedule" | "manual";
  status: string; // running | delivered | partial | failed | skipped
  params_resolved: Record<string, unknown> | null;
  row_count: number | null;
  recipients_sent: number;
  recipients_skipped: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface DbReportDelivery {
  id: string;
  run_id: string;
  user_id: string | null;
  email: string | null;
  status: string; // sent | failed | skipped
  reason: string | null;
  created_at: string;
}

export interface SavedReportListRow extends DbSavedReport {
  owner_name: string | null;
  schedule: DbReportSchedule | null;
  recipient_count: number;
  last_run: Pick<DbReportRun, "run_date" | "status" | "error" | "finished_at"> | null;
}

type Join = DbSavedReport & {
  owner: { display_name: string | null; first_name: string | null; last_name: string | null; email: string } | null;
  schedule: (DbReportSchedule & { recipients: { user_id: string }[] }) | (DbReportSchedule & { recipients: { user_id: string }[] })[] | null;
};

function ownerName(o: Join["owner"]): string | null {
  if (!o) return null;
  return o.display_name?.trim() || [o.first_name, o.last_name].filter(Boolean).join(" ").trim() || o.email;
}

const LIST_SELECT =
  "*, owner:profiles!saved_reports_owner_id_fkey(display_name, first_name, last_name, email), schedule:report_schedules(*, recipients:report_schedule_recipients(user_id))";

async function lastRuns(ids: string[]): Promise<Map<string, SavedReportListRow["last_run"]>> {
  const out = new Map<string, SavedReportListRow["last_run"]>();
  if (ids.length === 0) return out;
  const supabase = await db();
  const { data, error } = await supabase
    .from("report_runs")
    .select("saved_report_id, run_date, status, error, finished_at, started_at")
    .in("saved_report_id", ids)
    .order("started_at", { ascending: false });
  if (error) throw new Error(`lastRuns: ${error.message}`);
  for (const r of (data ?? []) as (DbReportRun & { saved_report_id: string })[]) {
    if (!out.has(r.saved_report_id)) {
      out.set(r.saved_report_id, { run_date: r.run_date, status: r.status, error: r.error, finished_at: r.finished_at });
    }
  }
  return out;
}

/** Saved reports, newest first. `ownerId` limits to one owner (non-admins). */
export async function listSavedReports(opts: { ownerId?: string } = {}): Promise<SavedReportListRow[]> {
  const supabase = await db();
  let q = supabase.from("saved_reports").select(LIST_SELECT).is("deleted_at", null).order("created_at", { ascending: false });
  if (opts.ownerId) q = q.eq("owner_id", opts.ownerId);
  const { data, error } = await q;
  if (error) throw new Error(`listSavedReports: ${error.message}`);
  const rows = (data ?? []) as unknown as Join[];
  const runs = await lastRuns(rows.map((r) => r.id));
  return rows.map((r) => {
    const { owner, schedule, ...rest } = r;
    const sch = Array.isArray(schedule) ? schedule[0] ?? null : schedule;
    const { recipients, ...schedRest } = sch ?? ({ recipients: [] } as unknown as NonNullable<typeof sch>);
    return {
      ...rest,
      owner_name: ownerName(owner),
      schedule: sch ? (schedRest as DbReportSchedule) : null,
      recipient_count: recipients?.length ?? 0,
      last_run: runs.get(r.id) ?? null,
    };
  });
}

export interface SavedReportDetail {
  report: DbSavedReport & { owner_name: string | null };
  schedule: DbReportSchedule | null;
  recipients: { user_id: string; name: string; email: string | null; status: string }[];
  runs: (DbReportRun & { deliveries: DbReportDelivery[] })[];
}

export async function getSavedReport(id: string): Promise<SavedReportDetail | null> {
  const supabase = await db();
  const { data, error } = await supabase.from("saved_reports").select(LIST_SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(`getSavedReport: ${error.message}`);
  if (!data) return null;
  const r = data as unknown as Join;
  const { owner, schedule, ...rest } = r;
  const sch = Array.isArray(schedule) ? schedule[0] ?? null : schedule;

  let recipients: SavedReportDetail["recipients"] = [];
  const ids = sch?.recipients?.map((x) => x.user_id) ?? [];
  if (ids.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name, first_name, last_name, email, status")
      .in("id", ids);
    recipients = ((profs ?? []) as {
      id: string;
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string;
      status: string;
    }[]).map((p) => ({
      user_id: p.id,
      name: p.display_name?.trim() || [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email,
      email: p.email,
      status: p.status,
    }));
  }

  const { data: runRows } = await supabase
    .from("report_runs")
    .select("*, deliveries:report_deliveries(*)")
    .eq("saved_report_id", id)
    .order("started_at", { ascending: false })
    .limit(50);

  let scheduleOut: DbReportSchedule | null = null;
  if (sch) {
    const { recipients: _r, ...s } = sch;
    void _r;
    scheduleOut = s as DbReportSchedule;
  }
  return {
    report: { ...(rest as DbSavedReport), owner_name: ownerName(owner) },
    schedule: scheduleOut,
    recipients,
    runs: (runRows ?? []) as (DbReportRun & { deliveries: DbReportDelivery[] })[],
  };
}

export interface SavedReportWrite {
  name: string;
  reportKey: SavedReportKey;
  params: SavedReportParams;
  format: ReportFormat;
}

export async function createSavedReport(input: SavedReportWrite, actorId: string): Promise<DbSavedReport> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("saved_reports")
    .insert({
      name: input.name,
      report_key: input.reportKey,
      params: input.params,
      format: input.format,
      owner_id: actorId,
      created_by: actorId,
      updated_by: actorId,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createSavedReport: ${error.message}`);
  return data as DbSavedReport;
}

export async function updateSavedReport(
  id: string,
  input: Omit<SavedReportWrite, "reportKey">,
  actorId: string,
  opts: { takeOwnership?: boolean } = {}
): Promise<DbSavedReport> {
  const supabase = await db();
  const patch: Record<string, unknown> = {
    name: input.name,
    params: input.params,
    format: input.format,
    updated_by: actorId,
  };
  if (opts.takeOwnership) patch.owner_id = actorId;
  const { data, error } = await supabase.from("saved_reports").update(patch).eq("id", id).select("*").single();
  if (error) throw new Error(`updateSavedReport: ${error.message}`);
  return data as DbSavedReport;
}

export async function softDeleteSavedReport(id: string, actorId: string): Promise<void> {
  const supabase = await db();
  const { error } = await supabase
    .from("saved_reports")
    .update({ deleted_at: new Date().toISOString(), updated_by: actorId })
    .eq("id", id);
  if (error) throw new Error(`softDeleteSavedReport: ${error.message}`);
  // A deleted report must stop emailing.
  await supabase
    .from("report_schedules")
    .update({ active: false, paused_reason: "The saved report was deleted.", paused_at: new Date().toISOString() })
    .eq("saved_report_id", id);
}

export interface ScheduleWrite {
  cadence: ReportCadence;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  startDate: string;
  recipientIds: string[];
}

/** Create or replace a report's schedule + recipients; (re)activates it. */
export async function upsertSchedule(savedReportId: string, input: ScheduleWrite, actorId: string): Promise<DbReportSchedule> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("report_schedules")
    .upsert(
      {
        saved_report_id: savedReportId,
        cadence: input.cadence,
        day_of_week: input.cadence === "weekly" ? input.dayOfWeek : null,
        day_of_month: input.cadence === "monthly" || input.cadence === "quarterly" ? input.dayOfMonth : null,
        start_date: input.startDate,
        active: true,
        paused_reason: null,
        paused_at: null,
        created_by: actorId,
        updated_by: actorId,
      },
      { onConflict: "saved_report_id" }
    )
    .select("*")
    .single();
  if (error) throw new Error(`upsertSchedule: ${error.message}`);
  const schedule = data as DbReportSchedule;

  await supabase.from("report_schedule_recipients").delete().eq("schedule_id", schedule.id);
  const ids = [...new Set(input.recipientIds)];
  if (ids.length > 0) {
    const { error: rErr } = await supabase
      .from("report_schedule_recipients")
      .insert(ids.map((user_id) => ({ schedule_id: schedule.id, user_id })));
    if (rErr) throw new Error(`upsertSchedule/recipients: ${rErr.message}`);
  }
  return schedule;
}

export async function setScheduleActive(
  savedReportId: string,
  active: boolean,
  actorId: string,
  reason?: string
): Promise<void> {
  const supabase = await db();
  const { error } = await supabase
    .from("report_schedules")
    .update({
      active,
      paused_reason: active ? null : reason ?? "Paused by a user.",
      paused_at: active ? null : new Date().toISOString(),
      updated_by: actorId,
    })
    .eq("saved_report_id", savedReportId);
  if (error) throw new Error(`setScheduleActive: ${error.message}`);
}

export async function deleteSchedule(savedReportId: string): Promise<void> {
  // A schedule (not the report) may be removed: its runs keep their history
  // (report_runs.schedule_id is SET NULL), and recipients cascade.
  const supabase = await db();
  const { error } = await supabase.from("report_schedules").delete().eq("saved_report_id", savedReportId);
  if (error) throw new Error(`deleteSchedule: ${error.message}`);
}

export interface RunProblem {
  saved_report_id: string;
  name: string;
  owner_id: string | null;
  run_date: string | null;
  status: string;
  error: string | null;
  paused: boolean;
}

/** 2f — failed runs in the last `days` days + paused schedules, for the hub banner. */
export async function listRunProblems(opts: { ownerId?: string; days?: number } = {}): Promise<RunProblem[]> {
  const supabase = await db();
  const since = new Date(Date.now() - (opts.days ?? 14) * 86_400_000).toISOString();
  let rq = supabase
    .from("report_runs")
    .select("saved_report_id, run_date, status, error, started_at, report:saved_reports!inner(name, owner_id, deleted_at)")
    .eq("status", "failed")
    .gte("started_at", since)
    .order("started_at", { ascending: false });
  if (opts.ownerId) rq = rq.eq("report.owner_id", opts.ownerId);
  const { data: runs, error } = await rq;
  if (error) throw new Error(`listRunProblems/runs: ${error.message}`);

  let sq = supabase
    .from("report_schedules")
    .select("saved_report_id, paused_reason, active, report:saved_reports!inner(name, owner_id, deleted_at)")
    .eq("active", false)
    .not("paused_reason", "is", null);
  if (opts.ownerId) sq = sq.eq("report.owner_id", opts.ownerId);
  const { data: paused, error: pErr } = await sq;
  if (pErr) throw new Error(`listRunProblems/paused: ${pErr.message}`);

  const out: RunProblem[] = [];
  const seen = new Set<string>();
  type R = { saved_report_id: string; run_date: string; status: string; error: string | null; report: { name: string; owner_id: string | null; deleted_at: string | null } };
  for (const r of (runs ?? []) as unknown as R[]) {
    if (r.report.deleted_at || seen.has(r.saved_report_id)) continue;
    seen.add(r.saved_report_id);
    out.push({ saved_report_id: r.saved_report_id, name: r.report.name, owner_id: r.report.owner_id, run_date: r.run_date, status: r.status, error: r.error, paused: false });
  }
  type P = { saved_report_id: string; paused_reason: string | null; report: { name: string; owner_id: string | null; deleted_at: string | null } };
  for (const p of (paused ?? []) as unknown as P[]) {
    if (p.report.deleted_at) continue;
    // A user-paused schedule isn't a problem; a self-paused one is.
    if (p.paused_reason === "Paused by a user." || p.paused_reason === "The saved report was deleted.") continue;
    const existing = out.find((o) => o.saved_report_id === p.saved_report_id);
    if (existing) existing.paused = true;
    else out.push({ saved_report_id: p.saved_report_id, name: p.report.name, owner_id: p.report.owner_id, run_date: null, status: "paused", error: p.paused_reason, paused: true });
  }
  return out;
}
