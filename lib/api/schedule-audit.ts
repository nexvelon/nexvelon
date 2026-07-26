import "server-only";

// SCHED-4 — the append-only schedule change log (migration 0113). Every booking
// mutation records one immutable row. recordScheduleAudit is BEST-EFFORT (§2.8):
// a log failure is swallowed and NEVER rolls back the booking that triggered it.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import type { DbScheduleAudit, DbScheduleAuditInsert } from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

export async function recordScheduleAudit(input: DbScheduleAuditInsert): Promise<void> {
  try {
    const supabase = await db();
    const { error } = await supabase.from("schedule_audit").insert(input);
    if (error) console.warn("[schedule-audit] insert failed:", error.message);
  } catch (e) {
    console.warn("[schedule-audit] insert threw:", e);
  }
}

export interface ListScheduleAuditFilter {
  scheduleJobId?: string;
  scheduleAssignmentId?: string;
  techId?: string;
  from?: string;
  to?: string;
}

export async function listScheduleAudit(
  filter: ListScheduleAuditFilter = {}
): Promise<DbScheduleAudit[]> {
  const supabase = await db();
  let q = supabase.from("schedule_audit").select("*");
  if (filter.scheduleJobId) q = q.eq("schedule_job_id", filter.scheduleJobId);
  if (filter.scheduleAssignmentId) q = q.eq("schedule_assignment_id", filter.scheduleAssignmentId);
  if (filter.techId) q = q.eq("tech_id", filter.techId);
  if (filter.from) q = q.gte("created_at", filter.from);
  if (filter.to) q = q.lte("created_at", filter.to);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error(`listScheduleAudit: ${error.message}`);
  return (data ?? []) as DbScheduleAudit[];
}
