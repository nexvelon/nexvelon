import "server-only";

// SCHED-1 — schedule_jobs data layer (migration 0111). A schedule_job is a
// dispatchable work unit (D3): it originates from a project job/task OR stands
// alone as an ad-hoc service call (no project). It carries the certs a booked
// tech must hold (required_certs) and an optional target window.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  DbScheduleJob,
  DbScheduleJobInsert,
  DbScheduleJobStatus,
  DbScheduleJobType,
  DbScheduleJobPriority,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

export interface ListScheduleJobsFilter {
  status?: DbScheduleJobStatus;
  unscheduledOnly?: boolean;
  from?: string; // window_start >= from
  to?: string; // window_start <= to
}

export async function listScheduleJobs(
  filter: ListScheduleJobsFilter = {}
): Promise<DbScheduleJob[]> {
  const supabase = await db();
  let q = supabase.from("schedule_jobs").select("*");
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.unscheduledOnly) q = q.eq("status", "unscheduled");
  if (filter.from) q = q.gte("window_start", filter.from);
  if (filter.to) q = q.lte("window_start", filter.to);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw new Error(`listScheduleJobs: ${error.message}`);
  return (data ?? []) as DbScheduleJob[];
}

export async function getScheduleJobById(id: string): Promise<DbScheduleJob | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("schedule_jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getScheduleJobById: ${error.message}`);
  return (data as DbScheduleJob | null) ?? null;
}

export interface CreateScheduleJobInput {
  title: string;
  jobType?: DbScheduleJobType;
  priority?: DbScheduleJobPriority;
  projectId?: string | null;
  projectJobId?: string | null;
  clientId?: string | null;
  siteId?: string | null;
  locationText?: string | null;
  description?: string | null;
  requiredCerts?: string[];
  estimatedHours?: number | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  actorId: string | null;
}

export async function createScheduleJob(
  input: CreateScheduleJobInput
): Promise<DbScheduleJob> {
  if (!input.title.trim()) throw new Error("A title is required.");
  const supabase = await db();

  const { data: refData, error: refErr } = await supabase.rpc(
    "next_schedule_job_reference"
  );
  if (refErr) throw new Error(`createScheduleJob/ref: ${refErr.message}`);

  const payload: DbScheduleJobInsert = {
    reference: refData as string,
    title: input.title.trim(),
    job_type: input.jobType ?? "service",
    priority: input.priority ?? "normal",
    project_id: input.projectId ?? null,
    project_job_id: input.projectJobId ?? null,
    client_id: input.clientId ?? null,
    site_id: input.siteId ?? null,
    location_text: input.locationText ?? null,
    description: input.description ?? null,
    required_certs: input.requiredCerts ?? [],
    estimated_hours: input.estimatedHours ?? null,
    window_start: input.windowStart ?? null,
    window_end: input.windowEnd ?? null,
    created_by: input.actorId,
    updated_by: input.actorId,
  };
  const { data, error } = await supabase
    .from("schedule_jobs")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(`createScheduleJob: ${error.message}`);
  return data as DbScheduleJob;
}

// Convenience — spawn a schedule_job from a planned project job, copying its
// title, project/client/site linkage and planned window as the target window.
export async function createScheduleJobFromProjectJob(input: {
  projectJobId: string;
  requiredCerts?: string[];
  actorId: string | null;
}): Promise<DbScheduleJob> {
  const supabase = await db();
  const { data: job, error: jErr } = await supabase
    .from("project_jobs")
    .select("id, project_id, title, planned_start_date, planned_end_date")
    .eq("id", input.projectJobId)
    .maybeSingle();
  if (jErr) throw new Error(`createScheduleJobFromProjectJob/job: ${jErr.message}`);
  if (!job) throw new Error("Project job not found.");
  const j = job as {
    id: string;
    project_id: string;
    title: string;
    planned_start_date: string | null;
    planned_end_date: string | null;
  };

  const { data: proj } = await supabase
    .from("projects")
    .select("client_id, site_id")
    .eq("id", j.project_id)
    .maybeSingle();
  const p = (proj as { client_id: string; site_id: string | null } | null) ?? null;

  return createScheduleJob({
    title: j.title,
    projectId: j.project_id,
    projectJobId: j.id,
    clientId: p?.client_id ?? null,
    siteId: p?.site_id ?? null,
    requiredCerts: input.requiredCerts ?? [],
    // Planned DATES become the target window (a date coerces to timestamptz).
    windowStart: j.planned_start_date,
    windowEnd: j.planned_end_date,
    actorId: input.actorId,
  });
}

export interface UpdateScheduleJobPatch {
  title?: string;
  jobType?: DbScheduleJobType;
  priority?: DbScheduleJobPriority;
  siteId?: string | null;
  locationText?: string | null;
  description?: string | null;
  requiredCerts?: string[];
  estimatedHours?: number | null;
  windowStart?: string | null;
  windowEnd?: string | null;
}

const JOB_PATCH_COLUMN: Record<keyof UpdateScheduleJobPatch, string> = {
  title: "title",
  jobType: "job_type",
  priority: "priority",
  siteId: "site_id",
  locationText: "location_text",
  description: "description",
  requiredCerts: "required_certs",
  estimatedHours: "estimated_hours",
  windowStart: "window_start",
  windowEnd: "window_end",
};

export async function updateScheduleJob(input: {
  id: string;
  patch: UpdateScheduleJobPatch;
  actorId: string | null;
}): Promise<void> {
  const row: Record<string, unknown> = {};
  for (const key of Object.keys(input.patch) as (keyof UpdateScheduleJobPatch)[]) {
    row[JOB_PATCH_COLUMN[key]] = input.patch[key];
  }
  if (Object.keys(row).length === 0) return; // empty diff (§2.8)
  row.updated_by = input.actorId;
  const supabase = await db();
  const { error } = await supabase.from("schedule_jobs").update(row).eq("id", input.id);
  if (error) throw new Error(`updateScheduleJob: ${error.message}`);
}

export async function setScheduleJobStatus(
  id: string,
  status: DbScheduleJobStatus,
  actorId: string | null
): Promise<void> {
  const supabase = await db();
  const { error } = await supabase
    .from("schedule_jobs")
    .update({ status, updated_by: actorId })
    .eq("id", id);
  if (error) throw new Error(`setScheduleJobStatus: ${error.message}`);
}

export async function deleteScheduleJob(id: string): Promise<boolean> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("schedule_jobs")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`deleteScheduleJob: ${error.message}`);
  return (data ?? []).length > 0;
}
