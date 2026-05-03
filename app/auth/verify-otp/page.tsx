"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth/AuthProvider";
import { signOutAction } from "@/app/(auth)/login/actions";
import { resendOtpAction, verifyOtpAction } from "./actions";

// ============================================================================
// Email-OTP entry — sign-in step 2.
// Reachable only when the middleware says has_pending_otp() === true.
// ============================================================================

const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyOtpPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, status } = useAuth();

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [resendIn, setResendIn] = useState<number>(RESEND_COOLDOWN_SECONDS);

  // Cooldown countdown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => {
      setResendIn((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const submit = (rawCode: string) => {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const next = searchParams.get("next");
      const result = await verifyOtpAction(rawCode, next);
      if (!result.ok) {
        setError(result.error);
        if (result.attemptsRemaining !== undefined) {
          setInfo(
            result.attemptsRemaining === 0
              ? null
              : `${result.attemptsRemaining} attempt${
                  result.attemptsRemaining === 1 ? "" : "s"
                } remaining.`
          );
        }
        return;
      }
      router.replace(result.redirectTo);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(code);
  };

  // Auto-submit when 6 digits typed.
  useEffect(() => {
    if (code.length === 6 && /^\d{6}$/.test(code) && !pending) {
      submit(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const handleResend = () => {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await resendOtpAction();
      if (!result.ok) {
        setError(result.error);
        if (result.retryAfterSeconds) {
          setResendIn(result.retryAfterSeconds);
        }
        return;
      }
      setResendIn(RESEND_COOLDOWN_SECONDS);
      toast.success("New code sent. Check your email.");
    });
  };

  const handleSignOut = () => {
    startTransition(async () => {
      await signOutAction();
    });
  };

  const maskedEmail = maskEmail(user?.email ?? "");

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
          <p className="nx-eyebrow mb-3">Two-factor verification</p>
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
              <ShieldCheck className="h-4 w-4" />
            </span>
            <h2
              className="font-serif text-2xl sm:text-3xl"
              style={{ color: "var(--brand-primary)" }}
            >
              Confirm it&rsquo;s you
            </h2>
          </div>
          <p className="nx-subtitle mt-2 text-sm">
            {status === "loading"
              ? "Loading…"
              : maskedEmail
              ? `We emailed a 6-digit code to ${maskedEmail}.`
              : "We emailed a 6-digit code to the address on file."}
          </p>
          <div className="nx-rule mt-4 mb-5" />

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="otp" className="nx-eyebrow-soft text-[10px]">
                Verification code
              </Label>
              <Input
                id="otp"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                autoComplete="one-time-code"
                autoFocus
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                disabled={pending}
                className="h-14 text-center font-mono text-2xl tracking-[0.6em]"
                aria-describedby={error ? "otp-error" : undefined}
                aria-invalid={!!error}
              />
            </div>

            {error && (
              <div
                id="otp-error"
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
            {info && !error && (
              <p className="text-muted-foreground text-[11px]">{info}</p>
            )}

            <button
              type="submit"
              disabled={pending || code.length !== 6}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md py-3 text-sm font-semibold tracking-[0.04em] shadow-sm transition-shadow hover:shadow-md disabled:opacity-60"
              style={{
                background: "var(--brand-accent)",
                color: "var(--brand-primary)",
                fontFamily: "var(--font-playfair), serif",
              }}
            >
              {pending ? "Verifying…" : "Verify"}
            </button>
          </form>

          <div className="mt-5 flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleResend}
              disabled={pending || resendIn > 0}
              className="text-muted-foreground hover:text-brand-charcoal flex min-h-11 items-center gap-2 px-2 text-xs disabled:opacity-50"
            >
              <Mail className="h-3.5 w-3.5" />
              {resendIn > 0
                ? `Send a new code in ${resendIn}s`
                : "Send a new code"}
            </button>

            <button
              type="button"
              onClick={handleSignOut}
              disabled={pending}
              className="text-muted-foreground hover:text-brand-charcoal min-h-11 px-2 text-xs underline-offset-4 hover:underline"
            >
              Use a different account
            </button>
          </div>
        </Card>

        <p className="text-muted-foreground mt-4 text-center text-[11px]">
          Codes expire after 10 minutes and can be used only once.
        </p>
      </div>
    </div>
  );
}

/**
 * "ja***@gmail.com" — show enough that the user knows which mailbox to check
 * but not the full address.
 */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0] ?? ""}*@${domain}`;
  return `${local.slice(0, 2)}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
}
