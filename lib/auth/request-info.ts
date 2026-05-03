import "server-only";

import { headers } from "next/headers";

/**
 * Server actions don't get the Request object directly, but they can read
 * incoming headers via next/headers. Vercel forwards the originating client
 * IP through `x-forwarded-for` (comma-separated, leftmost = original).
 *
 * Returns nullable strings — never throws. Callers should pass them straight
 * to writeAuditLog().
 */
export async function getRequestInfo(): Promise<{
  ip: string | null;
  userAgent: string | null;
}> {
  const h = await headers();
  const xff = h.get("x-forwarded-for") ?? "";
  const realIp = h.get("x-real-ip");
  const ip = xff.split(",")[0]?.trim() || realIp || null;
  const userAgent = h.get("user-agent") ?? null;
  return { ip, userAgent };
}
