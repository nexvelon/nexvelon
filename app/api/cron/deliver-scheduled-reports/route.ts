// REP-5 — the daily scheduled-report delivery endpoint. The SAME secured pattern
// as SNAP-1 (/api/cron/capture-balance-snapshots) and RECUR-1
// (/api/cron/generate-recurring-invoices) — Vercel Cron, Bearer CRON_SECRET, never
// triggerable unauthenticated, fails LOUD (non-200 + logged) so a monitor catches
// a broken run; idempotent (each occurrence is claimed in report_runs, so a
// double-fire sends nothing twice); catches up missed days (schedule.ts).
//
// Fires at 05:50 UTC = 00:50 EST / 01:50 EDT, so the America/Toronto business
// date has already rolled over: a month-end schedule on the 1st runs on the 1st
// and reports the month that just closed.
//
// Permissions are decided per run for the owner and every recipient
// (lib/reports/access.ts); the admin client here only lets the existing report
// queries read without a session — it grants no one anything.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runScheduledReports } from "@/lib/reports/run-scheduled";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// Generation + PDF rendering + email can take a while for several schedules.
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail CLOSED — an unconfigured secret is not "open"
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(req: Request): Promise<NextResponse> {
  if (!process.env.CRON_SECRET) {
    console.error("[cron/deliver-scheduled-reports] CRON_SECRET is not set — refusing to run.");
    return NextResponse.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const admin = createAdminClient() as unknown as SupabaseClient;
    const result = await runScheduledReports(admin, { trigger: "schedule" });
    // Per-schedule failures are recorded in report_runs (visible in the app) and
    // logged loud; the run itself succeeded, so 200 with errors[] (RECUR-1 rule).
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[cron/deliver-scheduled-reports] run failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// GET for Vercel Cron; POST for manual/other schedulers. Both require the secret.
export const GET = handle;
export const POST = handle;
