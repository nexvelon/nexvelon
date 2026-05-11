import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";

// ============================================================================
// /auth/reset-password — server component.
//
// Reachable when a user has clicked their recovery email link →
// /auth/confirm exchanged the token → set a session cookie → redirected
// here. So when we render, the user SHOULD be authenticated.
//
// If `getUser()` returns null (recovery token expired, was already
// consumed, or someone typed the URL directly), bounce back to the
// forgot-password form with `?expired=1` so the user gets a clear
// explanation instead of an empty form on a dead page.
// ============================================================================

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    console.info("[/auth/reset-password] no_session_redirecting_to_forgot", {
      hasError: !!error,
    });
    redirect("/auth/forgot-password?expired=1");
  }

  return <ResetPasswordForm userEmail={data.user.email ?? null} />;
}
