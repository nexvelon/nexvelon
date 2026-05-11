import { ForgotPasswordForm } from "./forgot-password-form";

// ============================================================================
// /auth/forgot-password — anonymous entry point for the reset flow.
//
// Server component. Reads `?expired=1` (set by /auth/reset-password when
// its session check fails — e.g. the recovery token expired or was
// consumed) so the form can render a one-shot banner above the email
// input explaining why the user landed here.
//
// The actual submit goes through ./forgot-password-form (client) → the
// requestPasswordResetAction in ./actions.ts.
// ============================================================================

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const params = await searchParams;
  const expired = params.expired === "1";

  return <ForgotPasswordForm expired={expired} />;
}
