// @vitest-environment node
//
// The middleware lets signed-out visitors reach the routes that authorise
// themselves (quote portal, invite flow, cron) and still sends everything else to
// /login. Before this fix, /q/* and /api/cron/* were missing, so in production a
// signed-out client opening a quote link, and every Vercel cron run, got a 307 to
// /login (confirmed with curl against app.nexvelonglobal.com).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const h = vi.hoisted(() => ({ user: null as { id: string; email: string | null } | null, pendingOtp: false }));

vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: async () => ({
    supabaseResponse: NextResponse.next(),
    user: h.user,
    hasPendingOtp: h.pendingOtp,
  }),
}));

import { middleware } from "@/middleware";
import { isPublicRoute } from "@/lib/auth/public-routes";

const TOKEN = "3f1c2b8e-0d5a-4c7e-9b1a-2e6f4d8c0a11";

async function go(path: string) {
  const res = await middleware(new NextRequest(new URL(path, "https://app.nexvelonglobal.com")));
  const location = res.headers.get("location");
  return { status: res.status, location: location ? new URL(location).pathname : null };
}

beforeEach(() => {
  h.user = null;
  h.pendingOtp = false;
});

describe("signed out", () => {
  it.each([
    `/q/${TOKEN}`,
    `/q/${TOKEN}/pdf`,
    "/api/cron/capture-balance-snapshots",
    "/api/cron/generate-recurring-invoices",
    "/api/cron/deliver-scheduled-reports",
    `/invite/${TOKEN}`,
    `/invite/${TOKEN}/client`,
    "/invite",
    "/login",
    "/auth/forgot-password",
  ])("can reach %s without being redirected", async (path) => {
    const r = await go(path);
    expect(r.location).toBeNull();
    expect(r.status).toBe(200);
  });

  it.each(["/dashboard", "/quotes", "/qa", "/q", "/clients", "/api/cron", "/api/cron-other", "/api/other", "/devices"])(
    "is sent to /login from %s",
    async (path) => {
      const r = await go(path);
      expect(r.status).toBe(307);
      expect(r.location).toBe("/login");
    }
  );
});

describe("signed in, second factor still pending", () => {
  beforeEach(() => {
    h.user = { id: "u1", email: "staff@example.com" };
    h.pendingOtp = true;
  });

  it("can still open a client's quote link (it doesn't use the staff session)", async () => {
    expect((await go(`/q/${TOKEN}`)).location).toBeNull();
  });

  it("is still sent to verify-otp from the app", async () => {
    const r = await go("/dashboard");
    expect(r.status).toBe(307);
    expect(r.location).toBe("/auth/verify-otp");
  });
});

describe("signed in", () => {
  it("opens a quote link normally", async () => {
    h.user = { id: "u1", email: "staff@example.com" };
    expect((await go(`/q/${TOKEN}`)).location).toBeNull();
  });
});

describe("isPublicRoute", () => {
  it("needs the trailing slash and something after it", () => {
    expect(isPublicRoute(`/q/${TOKEN}`)).toBe(true);
    expect(isPublicRoute("/q/")).toBe(false);
    expect(isPublicRoute("/q")).toBe(false);
    expect(isPublicRoute("/quotes")).toBe(false);
    expect(isPublicRoute("/api/cron/x")).toBe(true);
    expect(isPublicRoute("/api/cronx")).toBe(false);
    expect(isPublicRoute("/invite")).toBe(true);
  });
});
