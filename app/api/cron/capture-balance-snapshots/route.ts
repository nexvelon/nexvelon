// SNAP-1 — the daily balance-snapshot capture endpoint. Designed for Vercel Cron
// (vercel.json) but callable by ANY scheduler (GitHub Actions, launchd/curl,
// Supabase pg_cron + http). Secured by a Bearer CRON_SECRET so it can NEVER be
// triggered by an unauthenticated request. Fails LOUD: non-200 + a logged error so
// a monitor catches a missed capture. Idempotent (ON CONFLICT DO NOTHING), so a
// double-fire is harmless.

import { NextResponse } from "next/server";
import { captureBalanceSnapshots } from "@/lib/api/balance-snapshots";

export const dynamic = "force-dynamic";
// Never prerender/cache; always runs live.
export const revalidate = 0;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail CLOSED — an unconfigured secret is not "open"
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

async function handle(req: Request): Promise<NextResponse> {
  if (!process.env.CRON_SECRET) {
    console.error("[cron/capture-balance-snapshots] CRON_SECRET is not set — refusing to run.");
    return NextResponse.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await captureBalanceSnapshots();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[cron/capture-balance-snapshots] capture failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// GET for Vercel Cron; POST for manual/other schedulers. Both require the secret.
export const GET = handle;
export const POST = handle;
