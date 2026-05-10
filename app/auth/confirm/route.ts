import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// ============================================================================
// /auth/confirm — token_hash verification handler.
//
// All Supabase auth emails (invite, magic link, recovery, email-change,
// signup confirmation) route through THIS endpoint via the hashed-token
// flow:
//
//     {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}
//                                 &type=<invite|magiclink|recovery|...>
//                                 &next=<safe-internal-path>
//
// Why hashed-token over the default /auth/v1/verify?token=…:
//   The default link is a one-time GET that consumes the token on first
//   fetch. Gmail's link-scanner pre-fetches every URL in incoming mail,
//   which "uses up" the token before the human ever clicks. Result: by
//   the time the user opens the email, every link is already invalid.
//   token_hash links require an interactive cookie session to redeem.
//
// Why `redirect()` instead of `NextResponse.redirect()`:
//   `verifyOtp` writes session cookies via the cookie-aware client's
//   `setAll` callback — i.e. via the Next.js `cookies()` API. Those
//   writes need to merge into the outgoing redirect response or the
//   browser never receives the new session cookies and the next page
//   loads anonymous.
//
//   In Next 15 Route Handlers, `redirect()` from next/navigation throws
//   NEXT_REDIRECT and the framework intercepts it, building the redirect
//   response with all cookieStore writes attached. A manually-constructed
//   `NextResponse.redirect(...)` does NOT reliably inherit those writes —
//   it's a known foot-gun documented in Supabase's SSR guide. We switched
//   to `redirect()` after a Session-A bug where the post-set-password
//   submit landed in a session-expired state because the cookies set
//   here never made it to the browser.
// ============================================================================

const VALID_TYPES = new Set<EmailOtpType>([
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "signup",
  "email",
]);

function failRedirect(message: string): never {
  redirect(`/login?error=${encodeURIComponent(message)}`);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const typeParam = searchParams.get("type");
  const next = searchParams.get("next");

  console.info("[/auth/confirm] entry", {
    hasTokenHash: !!tokenHash,
    type: typeParam,
    nextParam: next,
  });

  if (!tokenHash || !typeParam) {
    console.warn("[/auth/confirm] missing_params");
    failRedirect(
      "That sign-in link is malformed. Ask your administrator to resend it."
    );
  }

  const type = typeParam as EmailOtpType;
  if (!VALID_TYPES.has(type)) {
    console.warn("[/auth/confirm] invalid_type", { type });
    failRedirect("That sign-in link is invalid.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    console.error("[/auth/confirm] verifyOtp_failed", {
      type,
      message: error.message,
    });
    failRedirect("That link is invalid or expired. Ask for a new one.");
  }

  console.info("[/auth/confirm] verifyOtp_ok — cookies queued for response");

  // Decide where to go next. `redirect()` throws NEXT_REDIRECT — the
  // framework attaches all cookieStore writes (the new session cookies
  // verifyOtp just queued) onto the outgoing redirect response.
  const safeNext = isSafeInternal(next);
  if (safeNext) {
    console.info("[/auth/confirm] redirecting_next", { dest: safeNext });
    redirect(safeNext);
  }

  switch (type) {
    case "invite":
    case "recovery":
      console.info("[/auth/confirm] redirecting_default", {
        dest: "/auth/set-password",
      });
      redirect("/auth/set-password");
    case "email_change":
    case "magiclink":
    case "signup":
    case "email":
    default:
      console.info("[/auth/confirm] redirecting_default", {
        dest: "/dashboard",
      });
      redirect("/dashboard");
  }
}

function isSafeInternal(p: string | null): string | null {
  if (!p) return null;
  if (!p.startsWith("/")) return null;
  if (p.startsWith("//")) return null;
  return p;
}
