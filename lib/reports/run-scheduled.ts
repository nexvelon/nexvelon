import "server-only";

// REP-5 — scheduled report delivery (2c–2f). Client-agnostic like the RECUR-1
// generator (lib/recurring/generate.ts): the secured cron passes the service-role
// client; an operator "Send now" passes the same, after its own session gate.
//
// Guarantees:
//   • IDEMPOTENT — each (schedule, run date) is CLAIMED in report_runs before
//     anything is generated (UNIQUE partial index); a re-run or a concurrent run
//     finds the claim and skips. An occurrence is never emailed twice.
//   • CATCH-UP — occurrences are computed from the schedule anchor
//     (lib/reports/schedule.ts planDueRuns), so a missed day is delivered next run;
//     relative dates resolve against the MISSED run date, not today.
//   • PERMISSION AT GENERATION — before generating, owner + every recipient are
//     re-resolved (lib/reports/principals.ts, fail-closed) and decided
//     (lib/reports/access.ts). Each recipient's copy is generated with the
//     owner ∩ recipient field gates; one email per recipient, never a shared list.
//   • LOUD + VISIBLE — every outcome is a report_runs row (delivered / partial /
//     failed / skipped, with the reason) and every recipient a report_deliveries
//     row; failures are logged and returned to the cron. A schedule whose OWNER can
//     no longer run the report pauses itself, with the reason recorded.
//   • AUDITED — each delivery writes an activity row on the saved report (§5).

import { businessDateISO } from "@/lib/format";
import { exportDataset, type ReportFormat } from "@/lib/reports/export";
import { buildReportDataset } from "@/lib/reports/build";
import { runUnattended } from "@/lib/supabase/unattended";
import { dispatchEmail } from "@/lib/email/dispatch";
import { loadPrincipals } from "@/lib/reports/principals";
import {
  planDelivery,
  gatesSignature,
  SKIP_REASON_TEXT,
  type RecipientDecision,
  type ReportFieldGates,
} from "@/lib/reports/access";
import { planDueRuns, type ReportCadence } from "@/lib/reports/schedule";
import { REPORT_CATALOG, isSavedReportKey, type SavedReportKey } from "@/lib/reports/catalog";
import { resolveParams, describeParams, type SavedReportParams } from "@/lib/reports/saved-params";
import type { ReportDataset } from "@/lib/reports/dataset";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ScheduledRunResult {
  asOf: string;
  schedulesConsidered: number;
  delivered: number; // runs with ≥1 email sent
  failed: number;
  skipped: number;
  emailsSent: number;
  errors: string[];
}

interface ScheduleRow {
  id: string;
  saved_report_id: string;
  cadence: ReportCadence;
  day_of_week: number | null;
  day_of_month: number | null;
  start_date: string;
  active: boolean;
  saved_report: {
    id: string;
    name: string;
    report_key: string;
    params: SavedReportParams | null;
    format: ReportFormat;
    owner_id: string | null;
    deleted_at: string | null;
  } | null;
  recipients: { user_id: string }[];
}

const SCHEDULE_SELECT =
  "id, saved_report_id, cadence, day_of_week, day_of_month, start_date, active, saved_report:saved_reports(id, name, report_key, params, format, owner_id, deleted_at), recipients:report_schedule_recipients(user_id)";

function appUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://app.nexvelonglobal.com").replace(/\/$/, "");
  return `${base}${path}`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function audit(client: SupabaseClient, savedReportId: string, label: string, changes: Record<string, unknown>) {
  const { error } = await client.from("activity_log").insert({
    entity_type: "saved_report",
    entity_id: savedReportId,
    action: "update",
    changes,
    actor_id: null,
    entity_label: label,
  });
  if (error) console.error(`[reports/scheduled] audit row failed for ${savedReportId}: ${error.message}`);
}

/** Compose one recipient's email (§2.8 — an empty report says so, plainly). */
export function composeReportEmail(input: {
  reportName: string;
  reportTitle: string;
  runDate: string;
  late: boolean;
  filters: string;
  period: string | null;
  dataset: ReportDataset;
  ownerName: string;
  link: string;
  redactedFields: boolean;
}): { subject: string; html: string; text: string } {
  const empty = input.dataset.rows.length === 0;
  const subject = `${input.reportName} — ${input.runDate}${input.late ? " (delivered late)" : ""}${empty ? " — no data" : ""}`;
  const lines = [
    `${input.reportTitle}: ${input.reportName}`,
    `Run date: ${input.runDate}${input.late ? " (this run was missed and delivered late; dated ranges are for the original run date)" : ""}`,
    input.period ? `Period: ${input.period}` : null,
    `Filters: ${input.filters}`,
    empty
      ? "This report has NO DATA for this run — nothing matched. That is not the same as a zero total."
      : `${input.dataset.rows.length} row${input.dataset.rows.length === 1 ? "" : "s"} — the full report is attached.`,
    input.redactedFields
      ? "Some cost fields are blank in your copy because your account (or the scheduler's) can't see them."
      : null,
    `Open it in Nexvelon: ${input.link}`,
    `You receive this because ${input.ownerName} scheduled it. It was generated with your own permissions at the time it ran.`,
  ].filter(Boolean) as string[];
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1A1F2E">
<p style="font-size:16px;margin:0 0 8px"><strong>${esc(input.reportName)}</strong></p>
${lines
  .slice(1)
  .map((l) =>
    l.startsWith("Open it in Nexvelon")
      ? `<p><a href="${esc(input.link)}">Open it in Nexvelon</a></p>`
      : `<p style="margin:4px 0">${esc(l)}</p>`
  )
  .join("\n")}
</div>`;
  return { subject, html, text: lines.join("\n") };
}

export interface DeliverOptions {
  asOf?: string;
  /** Restrict to one schedule (the operator "Send now"). */
  scheduleId?: string;
  /** "manual" = an operator Send now: one run dated today, not deduplicated. */
  trigger?: "schedule" | "manual";
  actorId?: string | null;
}

export async function runScheduledReports(
  client: SupabaseClient,
  opts: DeliverOptions = {}
): Promise<ScheduledRunResult> {
  const asOf = opts.asOf ?? businessDateISO();
  const trigger = opts.trigger ?? "schedule";
  const result: ScheduledRunResult = {
    asOf,
    schedulesConsidered: 0,
    delivered: 0,
    failed: 0,
    skipped: 0,
    emailsSent: 0,
    errors: [],
  };

  let q = client.from("report_schedules").select(SCHEDULE_SELECT);
  if (opts.scheduleId) q = q.eq("id", opts.scheduleId);
  else q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw new Error(`scheduledReports/load: ${error.message}`);
  const schedules = ((data ?? []) as unknown as ScheduleRow[]).filter(
    (s) => s.saved_report && !s.saved_report.deleted_at
  );
  result.schedulesConsidered = schedules.length;

  for (const s of schedules) {
    const sr = s.saved_report!;
    try {
      if (!isSavedReportKey(sr.report_key)) throw new Error(`Unknown report "${sr.report_key}".`);
      const key = sr.report_key;

      let runDates: string[];
      if (trigger === "manual") {
        runDates = [asOf];
      } else {
        const { data: done, error: dErr } = await client
          .from("report_runs")
          .select("run_date")
          .eq("schedule_id", s.id)
          .eq("trigger", "schedule");
        if (dErr) throw new Error(`recorded runs: ${dErr.message}`);
        const recorded = new Set(((done ?? []) as { run_date: string }[]).map((r) => r.run_date));
        const plan = planDueRuns(
          { cadence: s.cadence, dayOfWeek: s.day_of_week, dayOfMonth: s.day_of_month, startDate: s.start_date },
          asOf,
          recorded,
          { pointInTime: !!REPORT_CATALOG[key].pointInTime }
        );
        for (const sk of plan.skip) {
          const { error: skErr } = await client.from("report_runs").insert({
            saved_report_id: sr.id,
            schedule_id: s.id,
            run_date: sk.runDate,
            trigger: "schedule",
            status: "skipped",
            error: sk.reason,
            finished_at: new Date().toISOString(),
          });
          if (skErr && (skErr as { code?: string }).code !== "23505") throw new Error(`record skip: ${skErr.message}`);
          if (!skErr) result.skipped++;
        }
        runDates = plan.deliver;
      }

      for (const runDate of runDates) {
        const outcome = await deliverOne(client, s, key, runDate, asOf, trigger, opts.actorId ?? null);
        if (outcome.status === "claimed_elsewhere") continue;
        result.emailsSent += outcome.sent;
        if (outcome.status === "delivered" || outcome.status === "partial") result.delivered++;
        else if (outcome.status === "failed") {
          result.failed++;
          result.errors.push(`${sr.name} (${runDate}): ${outcome.error}`);
        } else result.skipped++;
      }
    } catch (e) {
      result.failed++;
      const msg = `${sr.name}: ${e instanceof Error ? e.message : String(e)}`;
      result.errors.push(msg);
      console.error(`[reports/scheduled] ${msg}`); // LOUD
    }
  }
  return result;
}

type DeliverOutcome =
  | { status: "delivered" | "partial" | "failed" | "skipped"; sent: number; error?: string }
  | { status: "claimed_elsewhere"; sent: 0 };

async function deliverOne(
  client: SupabaseClient,
  s: ScheduleRow,
  key: SavedReportKey,
  runDate: string,
  asOf: string,
  trigger: "schedule" | "manual",
  actorId: string | null
): Promise<DeliverOutcome> {
  const sr = s.saved_report!;
  const params = (sr.params ?? {}) as SavedReportParams;
  const resolved = resolveParams(key, params, runDate);

  // 1. Claim the occurrence BEFORE generating anything (double-send guard).
  const { data: claim, error: cErr } = await client
    .from("report_runs")
    .insert({
      saved_report_id: sr.id,
      schedule_id: s.id,
      run_date: runDate,
      trigger,
      status: "running",
      params_resolved: resolved,
      created_by: actorId,
    })
    .select("id")
    .maybeSingle();
  if (cErr) {
    if ((cErr as { code?: string }).code === "23505") return { status: "claimed_elsewhere", sent: 0 };
    throw new Error(`claim: ${cErr.message}`);
  }
  const runId = (claim as { id: string }).id;

  const finish = async (patch: Record<string, unknown>) => {
    const { error } = await client
      .from("report_runs")
      .update({ ...patch, finished_at: new Date().toISOString() })
      .eq("id", runId);
    if (error) console.error(`[reports/scheduled] run ${runId} update failed: ${error.message}`);
  };

  try {
    // 2. Permissions, re-resolved now (fail-closed).
    const recipientIds = s.recipients.map((r) => r.user_id);
    const principals = await loadPrincipals(client, [sr.owner_id ?? "", ...recipientIds]);
    const owner = sr.owner_id ? principals.get(sr.owner_id) ?? null : null;
    const plan = planDelivery({
      owner,
      recipients: recipientIds.map((id) => principals.get(id)).filter((p): p is NonNullable<typeof p> => !!p),
      reportKey: key,
    });

    if (!plan.ownerOk) {
      // The owner can't run it any more → generate NOTHING; pause until someone
      // permitted takes it over.
      await finish({ status: "failed", error: plan.ownerReason });
      await client
        .from("report_schedules")
        .update({ active: false, paused_reason: plan.ownerReason, paused_at: new Date().toISOString() })
        .eq("id", s.id);
      await audit(client, sr.id, sr.name, {
        schedule_paused: { from: "active", to: plan.ownerReason },
      });
      return { status: "failed", sent: 0, error: plan.ownerReason };
    }

    // 3. Generate once per distinct gate set, inside the unattended scope.
    const allowed = plan.recipients.filter((r) => r.allowed);
    const byGates = new Map<string, { gates: ReportFieldGates; recipients: RecipientDecision[] }>();
    for (const r of allowed) {
      const sig = gatesSignature(r.gates);
      const g = byGates.get(sig) ?? { gates: r.gates, recipients: [] };
      g.recipients.push(r);
      byGates.set(sig, g);
    }

    const deliveries: Record<string, unknown>[] = [];
    let sent = 0;
    let failed = 0;
    let rowCount: number | null = null;
    const ownerName = owner!.name;
    const late = trigger === "schedule" && runDate < asOf;
    const period = resolved.from && resolved.to ? `${resolved.from} to ${resolved.to}` : resolved.year ? String(resolved.year) : null;

    for (const { gates, recipients } of byGates.values()) {
      const dataset = await runUnattended(client, () => buildReportDataset(key, resolved, gates));
      rowCount = rowCount ?? dataset.rows.length;
      const file = await exportDataset(dataset, sr.format);
      const content = file.encoding === "base64" ? Buffer.from(file.data, "base64") : Buffer.from(file.data, "utf8");
      const mail = composeReportEmail({
        reportName: sr.name,
        reportTitle: REPORT_CATALOG[key].title,
        runDate,
        late,
        filters: describeParams(key, params),
        period,
        dataset,
        ownerName,
        link: appUrl(`/reports/saved/${sr.id}`),
        redactedFields: key === "inventory-valuation" && !gates.inventoryCost,
      });
      for (const r of recipients) {
        const res = await dispatchEmail({
          label: "scheduledReport",
          kind: "internal",
          to: r.principal.email!,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          attachments: [{ filename: file.filename, content }],
          log: { entityType: "saved_report", entityId: sr.id, sentBy: null },
        });
        if (res.ok) sent++;
        else failed++;
        deliveries.push({
          run_id: runId,
          user_id: r.principal.id,
          email: r.principal.email,
          status: res.ok ? "sent" : "failed",
          reason: res.ok ? null : res.error,
          provider_message_id: res.id,
        });
      }
    }
    for (const r of plan.recipients.filter((x) => !x.allowed)) {
      deliveries.push({
        run_id: runId,
        user_id: r.principal.id,
        email: r.principal.email,
        status: "skipped",
        reason: SKIP_REASON_TEXT[r.reason!],
      });
    }
    // A recipient whose profile no longer exists at all.
    const missing = recipientIds.filter((rid) => !principals.has(rid)).length;
    for (let i = 0; i < missing; i++) {
      deliveries.push({ run_id: runId, user_id: null, email: null, status: "skipped", reason: "User no longer exists." });
    }
    if (deliveries.length > 0) {
      const { error: dErr } = await client.from("report_deliveries").insert(deliveries);
      if (dErr) console.error(`[reports/scheduled] deliveries insert failed for run ${runId}: ${dErr.message}`);
    }

    const skipped = deliveries.filter((d) => d.status === "skipped").length;
    // Nothing sent is a FAILURE (visible), never a quiet success.
    const status = sent > 0 ? (failed > 0 || skipped > 0 ? "partial" : "delivered") : "failed";
    const err =
      sent > 0
        ? null
        : allowed.length === 0
          ? "No recipient is allowed to receive this report — nothing was sent."
          : "Every email failed to send.";
    await finish({ status, row_count: rowCount, recipients_sent: sent, recipients_skipped: skipped + failed, error: err });
    await audit(client, sr.id, sr.name, {
      delivery: {
        from: null,
        to: `${runDate}${late ? " (late)" : ""}: sent to ${sent}, skipped ${skipped}${failed ? `, failed ${failed}` : ""}${
          rowCount === 0 ? " — no data" : ""
        }`,
      },
    });
    return { status: status as "delivered" | "partial" | "failed", sent, error: err ?? undefined };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finish({ status: "failed", error: msg });
    await audit(client, sr.id, sr.name, { delivery: { from: null, to: `${runDate}: FAILED — ${msg}` } });
    console.error(`[reports/scheduled] ${sr.name} (${runDate}) failed: ${msg}`);
    return { status: "failed", sent: 0, error: msg };
  }
}
