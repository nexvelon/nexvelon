"use server";

// REP-5 — saved + scheduled report actions.
//
// Gating (2e):
//   • Saving / listing your own saved reports: reports:view.
//   • A saved report, its schedule, Send now: its OWNER or an Admin.
//   • Creating or editing one checks that the person can run that report
//     themselves (reports:view + the report's own gate) — via the same Principal
//     resolution + rules the scheduled runner uses (lib/reports/access.ts), so the
//     save-time check and the run-time check can't disagree.
//   • Saving a schedule checks every recipient NOW (and the runner re-checks every
//     run): a recipient who couldn't run the report is refused with their name,
//     and sending to anyone but yourself needs reports:create.
//   • Whoever saves or resumes a schedule becomes its OWNER — the permissions it
//     runs under are always a real, current person's, never a former editor's.

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth/profile";
import { can } from "@/lib/permissions/resolve";
import { logActivity, computeChanges } from "@/lib/api/activity-log";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { businessDateISO } from "@/lib/format";
import {
  listSavedReports,
  getSavedReport,
  createSavedReport,
  updateSavedReport,
  softDeleteSavedReport,
  upsertSchedule,
  setScheduleActive,
  deleteSchedule,
  listRunProblems,
  type SavedReportListRow,
  type SavedReportDetail,
  type RunProblem,
} from "@/lib/api/saved-reports";
import { loadPrincipals } from "@/lib/reports/principals";
import { canRunReport, planDelivery, SKIP_REASON_TEXT, fieldGatesFor } from "@/lib/reports/access";
import { REPORT_CATALOG, isSavedReportKey, type SavedReportKey } from "@/lib/reports/catalog";
import { normalizeParams, validateParams, resolveParams, describeParams, type SavedReportParams } from "@/lib/reports/saved-params";
import { validateSchedule, describeSchedule, type ReportCadence } from "@/lib/reports/schedule";
import { buildReportDataset } from "@/lib/reports/build";
import { exportDataset, type ReportExport, type ReportFormat } from "@/lib/reports/export";
import { runScheduledReports, type ScheduledRunResult } from "@/lib/reports/run-scheduled";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbProfile } from "@/lib/types/database";

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

const FORMATS: ReportFormat[] = ["pdf", "xlsx", "csv"];

async function me(): Promise<{ ok: true; profile: DbProfile } | { ok: false; error: string }> {
  const p = await getCurrentProfile();
  if (!p) return { ok: false, error: "You're not signed in." };
  if (p.status !== "Active") return { ok: false, error: "Your account is not active." };
  if (!(await can("reports", "view"))) return { ok: false, error: "You don't have access to reports." };
  return { ok: true, profile: p };
}

async function sessionClient(): Promise<SupabaseClient> {
  return (await createSupabaseServerClient()) as unknown as SupabaseClient;
}

/** The signed-in user as a Principal (same resolution the runner uses). */
async function principalFor(userId: string) {
  return (await loadPrincipals(await sessionClient(), [userId])).get(userId) ?? null;
}

/** Owner or Admin may manage a saved report. */
async function requireManage(id: string) {
  const gate = await me();
  if (!gate.ok) return gate;
  const detail = await getSavedReport(id);
  if (!detail || detail.report.deleted_at) return { ok: false as const, error: "Saved report not found." };
  const isOwner = detail.report.owner_id === gate.profile.id;
  if (!isOwner && gate.profile.role !== "Admin") {
    return { ok: false as const, error: "Only the person who saved this report (or an Admin) can change it." };
  }
  return { ok: true as const, profile: gate.profile, detail, isOwner };
}

function validateWrite(input: { name: string; reportKey: string; params: SavedReportParams; format: string }):
  | { ok: true; key: SavedReportKey; params: SavedReportParams }
  | { ok: false; error: string } {
  if (!input.name?.trim()) return { ok: false, error: "Give the saved report a name." };
  if (!isSavedReportKey(input.reportKey)) return { ok: false, error: "That report can't be saved." };
  if (!FORMATS.includes(input.format as ReportFormat)) return { ok: false, error: "Choose PDF, Excel or CSV." };
  const params = normalizeParams(input.reportKey, input.params);
  const err = validateParams(input.reportKey, params);
  if (err) return { ok: false, error: err };
  return { ok: true, key: input.reportKey, params };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listSavedReportsAction(): Promise<ActionResult<SavedReportListRow[]>> {
  try {
    const gate = await me();
    if (!gate.ok) return gate;
    // Admins see every saved report (to fix or take over a paused one); everyone
    // else sees their own.
    const ownerId = gate.profile.role === "Admin" ? undefined : gate.profile.id;
    return { ok: true, data: await listSavedReports({ ownerId }) };
  } catch (e) {
    return fail(e);
  }
}

export async function getSavedReportAction(id: string): Promise<ActionResult<SavedReportDetail>> {
  try {
    const gate = await requireManage(id);
    if (!gate.ok) return gate;
    return { ok: true, data: gate.detail };
  } catch (e) {
    return fail(e);
  }
}

/** 2f — problems the signed-in user should see (their own; Admins see all). */
export async function listReportProblemsAction(): Promise<ActionResult<RunProblem[]>> {
  try {
    const gate = await me();
    if (!gate.ok) return gate;
    const ownerId = gate.profile.role === "Admin" ? undefined : gate.profile.id;
    return { ok: true, data: await listRunProblems({ ownerId }) };
  } catch (e) {
    return fail(e);
  }
}

export interface RecipientOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

/** Active users who could be picked as recipients (permission is checked on save). */
export async function listReportRecipientOptionsAction(): Promise<ActionResult<RecipientOption[]>> {
  try {
    const gate = await me();
    if (!gate.ok) return gate;
    const supabase = await sessionClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, first_name, last_name, email, role, status")
      .eq("status", "Active")
      .order("first_name");
    if (error) throw new Error(error.message);
    return {
      ok: true,
      data: ((data ?? []) as {
        id: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        role: string;
      }[])
        .filter((p) => !!p.email)
        .map((p) => ({
          id: p.id,
          name: p.display_name?.trim() || [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email!,
          email: p.email!,
          role: p.role,
        })),
    };
  } catch (e) {
    return fail(e);
  }
}

// ─── Saved report CRUD ───────────────────────────────────────────────────────

export async function createSavedReportAction(input: {
  name: string;
  reportKey: string;
  params: SavedReportParams;
  format: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await me();
    if (!gate.ok) return gate;
    const v = validateWrite(input);
    if (!v.ok) return v;
    const principal = await principalFor(gate.profile.id);
    if (!principal || !canRunReport(principal, v.key)) {
      return { ok: false, error: "You can only save reports you're allowed to run." };
    }
    const row = await createSavedReport(
      { name: input.name.trim(), reportKey: v.key, params: v.params, format: input.format as ReportFormat },
      gate.profile.id
    );
    await logActivity(
      "saved_report",
      row.id,
      "create",
      {
        report: { from: null, to: REPORT_CATALOG[v.key].title },
        filters: { from: null, to: describeParams(v.key, v.params) },
        format: { from: null, to: row.format },
      },
      { entityLabel: row.name }
    );
    revalidatePath("/reports");
    revalidatePath("/reports/saved");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateSavedReportAction(
  id: string,
  input: { name: string; params: SavedReportParams; format: string }
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireManage(id);
    if (!gate.ok) return gate;
    const before = gate.detail.report;
    const v = validateWrite({ ...input, reportKey: before.report_key });
    if (!v.ok) return v;
    const row = await updateSavedReport(
      id,
      { name: input.name.trim(), params: v.params, format: input.format as ReportFormat },
      gate.profile.id
    );
    const changes = computeChanges(
      { name: before.name, filters: describeParams(before.report_key, before.params), format: before.format },
      { name: row.name, filters: describeParams(v.key, v.params), format: row.format }
    );
    if (Object.keys(changes).length > 0) {
      await logActivity("saved_report", id, "update", changes, { entityLabel: row.name });
    }
    revalidatePath("/reports/saved");
    revalidatePath(`/reports/saved/${id}`);
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteSavedReportAction(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireManage(id);
    if (!gate.ok) return gate;
    await softDeleteSavedReport(id, gate.profile.id);
    await logActivity(
      "saved_report",
      id,
      "delete",
      { deleted: { from: gate.detail.report.name, to: null }, ...(gate.detail.schedule ? { schedule: { from: "active", to: "stopped" } } : {}) },
      { entityLabel: gate.detail.report.name }
    );
    revalidatePath("/reports/saved");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

// ─── Run on demand (download for yourself) ───────────────────────────────────

export async function runSavedReportAction(
  id: string,
  format?: ReportFormat
): Promise<ActionResult<ReportExport & { rowCount: number }>> {
  try {
    const gate = await me();
    if (!gate.ok) return gate;
    const detail = await getSavedReport(id);
    if (!detail || detail.report.deleted_at) return { ok: false, error: "Saved report not found." };
    const key = detail.report.report_key;
    // Anyone opening a saved report runs it with THEIR OWN permissions.
    const principal = await principalFor(gate.profile.id);
    if (!principal || !canRunReport(principal, key)) {
      return { ok: false, error: "You don't have permission to run this report." };
    }
    if (detail.report.owner_id !== gate.profile.id && gate.profile.role !== "Admin") {
      return { ok: false, error: "This saved report belongs to someone else." };
    }
    const resolved = resolveParams(key, detail.report.params ?? {}, businessDateISO());
    const dataset = await buildReportDataset(key, resolved, fieldGatesFor(principal));
    const file = await exportDataset(dataset, format ?? detail.report.format);
    return { ok: true, data: { ...file, rowCount: dataset.rows.length } };
  } catch (e) {
    return fail(e);
  }
}

// ─── Schedule ────────────────────────────────────────────────────────────────

export async function saveScheduleAction(
  id: string,
  input: { cadence: ReportCadence; dayOfWeek: number | null; dayOfMonth: number | null; startDate: string; recipientIds: string[] }
): Promise<ActionResult<{ id: string; ownerChanged: boolean }>> {
  try {
    const gate = await requireManage(id);
    if (!gate.ok) return gate;
    const key = gate.detail.report.report_key;
    const invalid = validateSchedule({ cadence: input.cadence, dayOfWeek: input.dayOfWeek, dayOfMonth: input.dayOfMonth, startDate: input.startDate });
    if (invalid) return { ok: false, error: invalid };
    const recipientIds = [...new Set(input.recipientIds ?? [])];
    if (recipientIds.length === 0) return { ok: false, error: "Choose at least one recipient." };

    // The saver becomes the owner, so check THEM (and each recipient) now.
    const principals = await loadPrincipals(await sessionClient(), [gate.profile.id, ...recipientIds]);
    const plan = planDelivery({
      owner: principals.get(gate.profile.id) ?? null,
      recipients: recipientIds.map((r) => principals.get(r)).filter((p): p is NonNullable<typeof p> => !!p),
      reportKey: key,
    });
    if (!plan.ownerOk) return { ok: false, error: plan.ownerReason ?? "You can't schedule this report." };
    const refused = plan.recipients.filter((r) => !r.allowed);
    const unknown = recipientIds.filter((r) => !principals.has(r));
    if (refused.length > 0 || unknown.length > 0) {
      const lines = refused.map((r) => `${r.principal.name}: ${SKIP_REASON_TEXT[r.reason!]}`);
      if (unknown.length) lines.push(`${unknown.length} selected user(s) no longer exist.`);
      return { ok: false, error: `These people can't receive this report — ${lines.join(" ")}` };
    }

    const ownerChanged = gate.detail.report.owner_id !== gate.profile.id;
    if (ownerChanged) {
      const r = gate.detail.report;
      await updateSavedReport(id, { name: r.name, params: r.params, format: r.format }, gate.profile.id, { takeOwnership: true });
    }
    const before = gate.detail.schedule;
    const sch = await upsertSchedule(id, { ...input, recipientIds }, gate.profile.id);
    const summary = `${describeSchedule({ cadence: sch.cadence, dayOfWeek: sch.day_of_week, dayOfMonth: sch.day_of_month })} from ${sch.start_date} to ${recipientIds.length} recipient${recipientIds.length === 1 ? "" : "s"}`;
    await logActivity(
      "saved_report",
      id,
      before ? "update" : "create",
      {
        schedule: {
          from: before ? describeSchedule({ cadence: before.cadence, dayOfWeek: before.day_of_week, dayOfMonth: before.day_of_month }) : null,
          to: summary,
        },
        ...(ownerChanged ? { owner: { from: gate.detail.report.owner_name, to: gate.profile.email } } : {}),
      },
      { entityLabel: gate.detail.report.name }
    );
    revalidatePath(`/reports/saved/${id}`);
    revalidatePath("/reports/saved");
    return { ok: true, data: { id: sch.id, ownerChanged } };
  } catch (e) {
    return fail(e);
  }
}

export async function setScheduleActiveAction(id: string, active: boolean): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireManage(id);
    if (!gate.ok) return gate;
    if (!gate.detail.schedule) return { ok: false, error: "This report has no schedule." };
    if (active) {
      // Resuming re-runs the save-time checks under the person resuming it (who
      // becomes the owner) — a self-paused schedule only restarts for someone
      // allowed to run it.
      return saveScheduleAction(id, {
        cadence: gate.detail.schedule.cadence,
        dayOfWeek: gate.detail.schedule.day_of_week,
        dayOfMonth: gate.detail.schedule.day_of_month,
        startDate: gate.detail.schedule.start_date,
        recipientIds: gate.detail.recipients.map((r) => r.user_id),
      }).then((r) => (r.ok ? { ok: true as const, data: { id } } : r));
    }
    await setScheduleActive(id, false, gate.profile.id);
    await logActivity("saved_report", id, "update", { schedule: { from: "active", to: "paused" } }, { entityLabel: gate.detail.report.name });
    revalidatePath(`/reports/saved/${id}`);
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteScheduleAction(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireManage(id);
    if (!gate.ok) return gate;
    if (!gate.detail.schedule) return { ok: true, data: { id } };
    await deleteSchedule(id);
    await logActivity(
      "saved_report",
      id,
      "delete",
      {
        schedule: {
          from: describeSchedule({
            cadence: gate.detail.schedule.cadence,
            dayOfWeek: gate.detail.schedule.day_of_week,
            dayOfMonth: gate.detail.schedule.day_of_month,
          }),
          to: null,
        },
      },
      { entityLabel: gate.detail.report.name }
    );
    revalidatePath(`/reports/saved/${id}`);
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

/** Send now — deliver today's run to the schedule's recipients, under the SAME
 *  owner + recipient checks as the scheduled run. */
export async function sendSavedReportNowAction(id: string): Promise<ActionResult<ScheduledRunResult>> {
  try {
    const gate = await requireManage(id);
    if (!gate.ok) return gate;
    if (!gate.detail.schedule) return { ok: false, error: "Add a schedule (with recipients) first." };
    const admin = createAdminClient() as unknown as SupabaseClient;
    const res = await runScheduledReports(admin, {
      scheduleId: gate.detail.schedule.id,
      trigger: "manual",
      actorId: gate.profile.id,
    });
    revalidatePath(`/reports/saved/${id}`);
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}
