"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Eye, EyeOff, KeyRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkPassword } from "@/lib/auth/password-policy";
import {
  PasswordStrengthMeter,
  PasswordPolicyChecklist,
} from "@/components/auth/PasswordPolicyMeter";
import { updatePasswordAction } from "./actions";

// ============================================================================
// Reset-password form — two password fields (new + confirm), live strength
// meter, per-rule policy checklist. Visually mirrors /auth/set-password so
// the flow feels continuous.
//
// On submit, updatePasswordAction sets the password via supabase.auth
// .updateUser, then signs out (local scope — clears cookies without the
// CORS-failing global logout call) and redirects to /login?reset=ok. The
// /login page shows a success banner; the user signs in fresh with the
// new password.
// ============================================================================

function isNextRedirect(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

interface ResetPasswordFormProps {
  userEmail: string | null;
}

export function ResetPasswordForm({ userEmail }: ResetPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const check = useMemo(() => checkPassword(password), [password]);
  const matches = password.length > 0 && password === confirm;
  const canSubmit = check.ok && matches && !pending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;

    setPending(true);
    try {
      const result = await updatePasswordAction(password, confirm);
      if (result && result.ok === false) {
        setPending(false);
        setError(result.error);
      }
    } catch (e: unknown) {
      if (isNextRedirect(e)) {
        // Page is about to unmount as Next navigates to /login?reset=ok.
        // Don't reset pending.
        throw e;
      }
      setPending(false);
      console.error("[resetPassword client] unexpected error:", e);
      setError("Something went wrong saving your password. Please try again.");
    }
  };

  return (
    <div
      className="grid min-h-[100dvh] place-items-center p-4 sm:p-6"
      style={{ background: "var(--brand-bg)" }}
    >
      <div className="w-full max-w-md">
        <Card
          className="p-6 shadow-sm sm:p-8"
          style={{
            borderTop: "2px solid var(--brand-accent)",
            background: "var(--brand-card)",
          }}
        >
          <p className="nx-eyebrow mb-3">Choose a new password</p>
          <div className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{
                background:
                  "color-mix(in oklab, var(--brand-accent) 15%, transparent)",
                color: "var(--brand-accent)",
              }}
              aria-hidden
            >
              <KeyRound className="h-4 w-4" />
            </span>
            <h2
              className="font-serif text-2xl sm:text-3xl"
              style={{ color: "var(--brand-primary)" }}
            >
              Reset your password
            </h2>
          </div>
          <p className="nx-subtitle mt-2 text-sm">
            {userEmail
              ? `Signed in as ${userEmail}.`
              : "Pick a new password to finish the reset."}
          </p>
          <div className="nx-rule mt-4 mb-5" />

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className="nx-eyebrow-soft text-[10px]"
              >
                New password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  disabled={pending}
                  className="h-11 pr-12"
                  aria-describedby="password-policy"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="text-muted-foreground hover:text-brand-charcoal absolute top-1/2 right-1 flex h-11 w-11 -translate-y-1/2 items-center justify-center"
                  aria-label={showPwd ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPwd ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <PasswordStrengthMeter check={check} />
            <PasswordPolicyChecklist check={check} id="password-policy" />

            <div className="space-y-1.5">
              <Label
                htmlFor="confirm"
                className="nx-eyebrow-soft text-[10px]"
              >
                Confirm password
              </Label>
              <Input
                id="confirm"
                type={showPwd ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
                disabled={pending}
                className="h-11"
                aria-invalid={confirm.length > 0 && !matches}
              />
              {confirm.length > 0 && !matches && (
                <p
                  className="text-[11px]"
                  style={{ color: "var(--brand-status-red)" }}
                >
                  Passwords don&rsquo;t match.
                </p>
              )}
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border px-3 py-2 text-xs"
                style={{
                  background:
                    "color-mix(in oklab, var(--brand-status-red) 10%, transparent)",
                  borderColor:
                    "color-mix(in oklab, var(--brand-status-red) 35%, transparent)",
                  color: "var(--brand-status-red)",
                }}
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md py-3 text-sm font-semibold tracking-[0.04em] shadow-sm transition-shadow hover:shadow-md disabled:opacity-60"
              style={{
                background: "var(--brand-accent)",
                color: "var(--brand-primary)",
                fontFamily: "var(--font-playfair), serif",
              }}
            >
              {pending ? "Saving new password…" : "Save new password"}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}

