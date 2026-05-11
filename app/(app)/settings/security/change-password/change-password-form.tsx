"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertCircle, Eye, EyeOff, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkPassword } from "@/lib/auth/password-policy";
import {
  PasswordStrengthMeter,
  PasswordPolicyChecklist,
} from "@/components/auth/PasswordPolicyMeter";
import { changeOwnPasswordAction } from "./actions";

// ============================================================================
// Change-password form (self-service, signed-in users).
//
// Three fields (current / new / confirm) + a "Sign out other devices"
// checkbox. Reuses the shared strength meter + per-rule checklist that
// /auth/set-password and /auth/reset-password also use.
//
// Submit gated client-side on:
//   - all three fields filled,
//   - new password passes policy,
//   - new === confirm,
//   - new !== current.
//
// Server returns specific error strings (never generic "something went
// wrong"). On success: clear all fields, uncheck the box, show a
// "Password updated" toast, stay on the page. Mentions explicitly if
// other-devices sign-out was requested + completed.
// ============================================================================

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [signOutOthers, setSignOutOthers] = useState(false);

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const check = useMemo(() => checkPassword(newPassword), [newPassword]);
  const matches = newPassword.length > 0 && newPassword === confirm;
  const differs = newPassword.length > 0 && newPassword !== currentPassword;
  const allFieldsFilled =
    currentPassword.length > 0 && newPassword.length > 0 && confirm.length > 0;
  const canSubmit =
    !pending && allFieldsFilled && check.ok && matches && differs;

  const resetFields = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirm("");
    setSignOutOthers(false);
    setShowCurrent(false);
    setShowNew(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;

    startTransition(async () => {
      const result = await changeOwnPasswordAction({
        currentPassword,
        newPassword,
        signOutOtherDevices: signOutOthers,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      resetFields();
      toast.success(
        result.otherDevicesSignedOut
          ? "Password updated. Other devices have been signed out."
          : "Password updated."
      );
    });
  };

  return (
    <Card
      className="p-6 shadow-sm sm:p-8"
      style={{
        borderTop: "2px solid var(--brand-accent)",
        background: "var(--brand-card)",
      }}
    >
      <p className="nx-eyebrow mb-3">Account Security</p>
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
          Change your password
        </h2>
      </div>
      <p className="nx-subtitle mt-2 text-sm">
        Replace the password on your Nexvelon account. You&rsquo;ll keep your
        current session active.
      </p>
      <div className="nx-rule mt-4 mb-5" />

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label
            htmlFor="current-password"
            className="nx-eyebrow-soft text-[10px]"
          >
            Current password
          </Label>
          <div className="relative">
            <Input
              id="current-password"
              type={showCurrent ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
              disabled={pending}
              className="h-11 pr-12"
            />
            <button
              type="button"
              onClick={() => setShowCurrent((v) => !v)}
              className="text-muted-foreground hover:text-brand-charcoal absolute top-1/2 right-1 flex h-11 w-11 -translate-y-1/2 items-center justify-center"
              aria-label={showCurrent ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showCurrent ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="new-password"
            className="nx-eyebrow-soft text-[10px]"
          >
            New password
          </Label>
          <div className="relative">
            <Input
              id="new-password"
              type={showNew ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
              disabled={pending}
              className="h-11 pr-12"
              aria-describedby="change-password-policy"
              aria-invalid={
                newPassword.length > 0 && (!check.ok || !differs)
              }
            />
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              className="text-muted-foreground hover:text-brand-charcoal absolute top-1/2 right-1 flex h-11 w-11 -translate-y-1/2 items-center justify-center"
              aria-label={showNew ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showNew ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {newPassword.length > 0 && !differs && (
            <p
              className="text-[11px]"
              style={{ color: "var(--brand-status-red)" }}
            >
              Must differ from your current password.
            </p>
          )}
        </div>

        <PasswordStrengthMeter check={check} />
        <PasswordPolicyChecklist check={check} id="change-password-policy" />

        <div className="space-y-1.5">
          <Label
            htmlFor="confirm-password"
            className="nx-eyebrow-soft text-[10px]"
          >
            Confirm new password
          </Label>
          <Input
            id="confirm-password"
            type={showNew ? "text" : "password"}
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

        <label
          htmlFor="sign-out-others"
          className="flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2.5 text-xs leading-snug transition-colors hover:bg-[color-mix(in_oklab,var(--brand-accent)_4%,transparent)]"
          style={{
            borderColor:
              "color-mix(in oklab, var(--brand-primary) 12%, transparent)",
          }}
        >
          <input
            id="sign-out-others"
            type="checkbox"
            checked={signOutOthers}
            onChange={(e) => setSignOutOthers(e.target.checked)}
            disabled={pending}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--brand-accent)]"
          />
          <span>
            <span
              className="block font-semibold tracking-[0.04em]"
              style={{ color: "var(--brand-primary)" }}
            >
              Sign out other devices
            </span>
            <span className="text-muted-foreground mt-0.5 block text-[11px]">
              Recommended if you&rsquo;re changing your password because
              you&rsquo;re concerned about account security.
            </span>
          </span>
        </label>

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
          {pending ? "Updating password…" : "Update password"}
        </button>
      </form>
    </Card>
  );
}
