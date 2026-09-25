// RECUR-1 — the daily recurring-invoice generation endpoint. Same secured pattern
// as SNAP-1 (/api/cron/capture-balance-snapshots): Bearer CRON_SECRET so it can
// NEVER be triggered unauthenticated; fails LOUD (non-200 + logged) so a monitor
// catches a missed run; idempotent (the period-claim UNIQUE constraint) so a
// double-fire is harmless; catches up missed days (billingRuns is anchor-based).
//
// Runs the generation as SERVICE-ROLE (admin client, no session) over active
// contracts in automatic + draft_for_approval modes. Manual contracts are excluded
// (they only bill via an operator "generate now").

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateDueContractInvoices } from "@/lib/recurring/generate";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail CLOSED — an unconfigured secret is not "open"
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(req: Request): Promise<NextResponse> {
  if (!process.env.CRON_SECRET) {
    console.error("[cron/generate-recurring-invoices] CRON_SECRET is not set — refusing to run.");
    return NextResponse.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const admin = createAdminClient() as unknown as SupabaseClient;
    const result = await generateDueContractInvoices(admin, { includeManual: false });
    // A run with per-contract failures is still a 200 (the run itself succeeded);
    // the errors[] are logged loud in the engine and surfaced in the payload.
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[cron/generate-recurring-invoices] generation failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// GET for Vercel Cron; POST for manual/other schedulers. Both require the secret.
export const GET = handle;
export const POST = handle;
