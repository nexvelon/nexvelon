"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Eye, EyeOff, KeyRound, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth/AuthProvider";
import { checkPassword } from "@/lib/auth/password-policy";
import { setPasswordAction } from "./actions";

// ============================================================================
// Set-password page — completes the invite flow.
// Reachable when Supabase invite magic-link redirects through /auth/callback
// and the resulting session lands here. Validates against the project
// password policy with a live strength meter and per-rule checklist.
// ============================================================================

export default function SetPasswordPage() {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const check = useMemo(() => checkPassword(password), [password]);
  const matches = password.length > 0 && password === confirm;
  const canSubmit = check.ok && matches && !pending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;

    startTransition(async () => {
      const result = await setPasswordAction(password, confirm);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Pull the freshly-flipped status onto the client AuthProvider so any
      // <Can> guards on /dashboard render with the right gate.
      await refreshProfile();
      router.replace(result.redirectTo);
    });
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
          <p className="nx-eyebrow mb-3">Welcome to Nexvelon</p>
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
              Set your password
            </h2>
          </div>
          <p className="nx-subtitle mt-2 text-sm">
            {user?.email
              ? `Signed in as ${user.email}.`
              : "Pick a password to finish setting up your account."}
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

            {/* Strength meter */}
            <div className="space-y-1.5">
              <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--brand-primary)_8%,transparent)]">
                {[0, 1, 2, 3].map((seg) => (
                  <div
                    key={seg}
                    className="h-full flex-1 transition-colors"
                    style={{
                      background:
                        check.score > seg
                          ? check.score >= 3
                            ? "var(--brand-status-green, #2F7A4D)"
                            : check.score === 2
                            ? "var(--brand-accent)"
                            : "var(--brand-status-red)"
                          : "transparent",
                      borderRight:
                        seg < 3
                          ? "1px solid color-mix(in oklab, var(--brand-primary) 8%, transparent)"
                          : undefined,
                    }}
                    aria-hidden
                  />
                ))}
              </div>
              <p className="text-muted-foreground text-[11px]">{check.label}</p>
            </div>

            <ul
              id="password-policy"
              className="grid grid-cols-1 gap-1 sm:grid-cols-2"
            >
              <PolicyItem ok={check.rules.length} label="At least 12 characters" />
              <PolicyItem ok={check.rules.lower} label="Lowercase letter" />
              <PolicyItem ok={check.rules.upper} label="Uppercase letter" />
              <PolicyItem ok={check.rules.digit} label="Digit (0–9)" />
              <PolicyItem ok={check.rules.symbol} label="Symbol" />
            </ul>

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
                <p className="text-[11px]" style={{ color: "var(--brand-status-red)" }}>
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
              {pending ? "Saving…" : "Save password & continue"}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function PolicyItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li
      className="flex items-center gap-1.5 text-[11px]"
      style={{
        color: ok ? "var(--brand-primary)" : "var(--muted-foreground, #8C8273)",
      }}
    >
      {ok ? (
        <Check className="h-3 w-3" style={{ color: "var(--brand-accent)" }} />
      ) : (
        <X className="h-3 w-3 opacity-50" />
      )}
      <span>{label}</span>
    </li>
  );
}
