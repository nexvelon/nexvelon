import { NextResponse, type NextRequest } from "next/server";
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
//
//   token_hash links require an interactive cookie session to redeem
//   (the verifyOtp call below sets cookies as part of its response).
//   Bots that do GET requests without a cookie jar can't make verifyOtp
//   succeed, so the token survives until the human actually clicks.
//
// On verifyOtp success the Supabase server client writes session cookies
// onto the redirect response, so the next page (e.g. /auth/set-password)
// already sees the authenticated user.
// ============================================================================

const VALID_TYPES = new Set<EmailOtpType>([
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "signup",
  "email",
]);

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const typeParam = searchParams.get("type");
  const next = searchParams.get("next");

  if (!tokenHash || !typeParam) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(
        "That sign-in link is malformed. Ask your administrator to resend it."
      )}`
    );
  }

  const type = typeParam as EmailOtpType;
  if (!VALID_TYPES.has(type)) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(
        "That sign-in link is invalid."
      )}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(
        "That link is invalid or expired. Ask for a new one."
      )}`
    );
  }

  // Decide where to go next.
  const safeNext = isSafeInternal(next);
  if (safeNext) return NextResponse.redirect(`${origin}${safeNext}`);

  switch (type) {
    case "invite":
    case "recovery":
      return NextResponse.redirect(`${origin}/auth/set-password`);
    case "email_change":
    case "magiclink":
    case "signup":
    case "email":
    default:
      return NextResponse.redirect(`${origin}/dashboard`);
  }
}

function isSafeInternal(p: string | null): string | null {
  if (!p) return null;
  if (!p.startsWith("/")) return null;
  if (p.startsWith("//")) return null;
  return p;
}
