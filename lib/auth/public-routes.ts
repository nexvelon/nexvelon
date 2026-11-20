// Routes a signed-out visitor may reach without being sent to /login. Each one
// authorises the request itself, and none reads data as the signed-out role
// (SEC-3: they read through the service-role client, scoped by their own check):
//
//   /invite, /invite/<token>/*   client onboarding: the unguessable invite token
//                                (POLISH-3)
//   /q/<token>, /q/<token>/pdf   the quote portal: the per-recipient portal token
//                                (0129/0131)
//   /api/cron/*                  scheduled jobs: a Bearer CRON_SECRET header;
//                                Vercel Cron sends no session cookie
//
// The /q/ and /api/cron/ entries were missing until this fix, so in production a
// signed-out client opening a quote link, and every Vercel cron run, got a 307
// to /login and never reached the route.
//
// Prefix matches require the trailing slash, so "/quotes" or "/qa" can't slip
// through as "/q", and "/api/cron-anything" can't pass as "/api/cron/".

const PUBLIC_EXACT = new Set<string>(["/invite"]);
const PUBLIC_PREFIXES = ["/invite/", "/q/", "/api/cron/"] as const;

export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p) && pathname.length > p.length);
}
