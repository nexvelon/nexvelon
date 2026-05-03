import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ============================================================================
// Supabase Auth callback (PKCE code exchange).
//
// Lands here after the user clicks any Supabase email link — invite,
// magic-link, password-reset, email-change. The URL carries `?code=...`
// (and possibly a `?next=...` we set when generating the link). We:
//
//   1. Exchange the code for a session (sets the auth cookies).
//   2. Redirect to ?next= if it's a safe internal path, else to a sensible
//      default per link type.
//
// Errors (expired link, already-used code, etc.) bounce back to /login with
// a flag the login page can surface as an inline error.
// ============================================================================

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type"); // 'invite' | 'recovery' | 'magiclink' | 'email_change' | ...
  const next = searchParams.get("next");

  const supabase = await createClient();

  // PKCE flow — most modern Supabase emails use this.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent("That sign-in link is no longer valid. Please request a fresh one.")}`
      );
    }
  } else if (tokenHash && type) {
    // Older OTP-style verification path.
    type ValidOtpType = "invite" | "recovery" | "magiclink" | "email_change";
    const validTypes: ValidOtpType[] = [
      "invite",
      "recovery",
      "magiclink",
      "email_change",
    ];
    if (!validTypes.includes(type as ValidOtpType)) {
      return NextResponse.redirect(`${origin}/login`);
    }
    const { error } = await supabase.auth.verifyOtp({
      type: type as ValidOtpType,
      token_hash: tokenHash,
    });
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent("That link is no longer valid.")}`
      );
    }
  } else {
    // No code at all — nothing to do here.
    return NextResponse.redirect(`${origin}/login`);
  }

  // ---- Decide where to go next -------------------------------------------
  const safeNext = isSafeInternal(next) ? (next as string) : null;

  if (safeNext) {
    return NextResponse.redirect(`${origin}${safeNext}`);
  }

  // No explicit next: default by link type.
  // - invite          → /auth/set-password (must finish enrollment)
  // - recovery        → /auth/set-password (reuse the password form)
  // - magiclink       → /dashboard (will pass through OTP gate naturally)
  // - email_change    → /settings (eventually) — for now /dashboard
  switch (type) {
    case "invite":
    case "recovery":
      return NextResponse.redirect(`${origin}/auth/set-password`);
    case "email_change":
    case "magiclink":
    default:
      return NextResponse.redirect(`${origin}/dashboard`);
  }
}

function isSafeInternal(p: string | null): boolean {
  if (!p) return false;
  if (!p.startsWith("/")) return false;
  if (p.startsWith("//")) return false;
  return true;
}
