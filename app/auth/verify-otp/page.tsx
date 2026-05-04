"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
//
// Loading state is managed manually (instead of useTransition) so that a
// 30-second timeout can flip pending=false and re-enable the Verify button
// for retry. With useTransition there's no way to abort a server action
// that's actually still in flight on the server; manual state lets us
// gracefully fail forward.
// ============================================================================

const RESEND_COOLDOWN_SECONDS = 60;
const VERIFY_TIMEOUT_MS = 30_000;

/**
 * Type-narrow: NEXT_REDIRECT errors thrown by the server action's
 * redirect() must be re-thrown so Next's framework can perform the
 * navigation. They're identified by a `digest` string starting with
 * "NEXT_REDIRECT".
 */
function isNextRedirect(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export default function VerifyOtpPage() {
  const searchParams = useSearchParams();
  const { user, status } = useAuth();

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [signOutPending, setSignOutPending] = useState(false);
  const [resendIn, setResendIn] = useState<number>(RESEND_COOLDOWN_SECONDS);

  // Track the active timeout so we can clear it on success/failure.
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resend cooldown countdown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => {
      setResendIn((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  // Clear timeout on unmount so we don't leak.
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const submit = async (rawCode: string) => {
    if (pending) return;
    setError(null);
    setInfo(null);
    setPending(true);

    // 30-second client-side timeout. Flips pending back so the user can
    // retry, surfaces a clear error message.
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setPending(false);
      setError(
        "Verification timed out. Tap Verify to try again, or request a new code."
      );
    }, VERIFY_TIMEOUT_MS);

    try {
      const next = searchParams.get("next");
      const result = await verifyOtpAction(rawCode, next);

      // Reaching here means the action returned (failure path).
      // The success path uses redirect() which throws NEXT_REDIRECT —
      // we never see a returned value on success.
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setPending(false);

      if (!result || result.ok !== false) return; // defensive
      setError(result.error);
      if (
        "attemptsRemaining" in result &&
        result.attemptsRemaining !== undefined
      ) {
        setInfo(
          result.attemptsRemaining === 0
            ? null
            : `${result.attemptsRemaining} attempt${
                result.attemptsRemaining === 1 ? "" : "s"
              } remaining.`
        );
      }
    } catch (e: unknown) {
      // Re-throw NEXT_REDIRECT so Next can handle the navigation.
      if (isNextRedirect(e)) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        // Don't reset pending — the page is about to unmount as Next
        // navigates to the destination.
        throw e;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setPending(false);
      console.error("[verifyOtp client] unexpected error:", e);
      setError("Verification failed unexpectedly. Please try again.");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submit(code);
  };

  // Auto-submit when 6 digits typed.
  useEffect(() => {
    if (code.length === 6 && /^\d{6}$/.test(code) && !pending) {
      void submit(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const handleResend = async () => {
    if (pending) return;
    setError(null);
    setInfo(null);
    setPending(true);
    try {
      const result = await resendOtpAction();
      setPending(false);
      if (!result.ok) {
        setError(result.error);
        if (result.retryAfterSeconds) {
          setResendIn(result.retryAfterSeconds);
        }
        return;
      }
      setResendIn(RESEND_COOLDOWN_SECONDS);
      toast.success("New code sent. Check your email.");
    } catch (e) {
      setPending(false);
      console.error("[verifyOtp resend] error:", e);
      setError("Couldn't send a new code. Please try again.");
    }
  };

  const handleSignOut = async () => {
    if (signOutPending) return;
    setSignOutPending(true);
    try {
      await signOutAction();
    } catch (e: unknown) {
      // signOutAction also uses redirect() — re-throw NEXT_REDIRECT.
      if (isNextRedirect(e)) throw e;
      setSignOutPending(false);
      console.error("[verifyOtp signOut] error:", e);
    }
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
              onClick={() => void handleResend()}
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
              onClick={() => void handleSignOut()}
              disabled={signOutPending}
              className="text-muted-foreground hover:text-brand-charcoal min-h-11 px-2 text-xs underline-offset-4 hover:underline disabled:opacity-50"
            >
              {signOutPending ? "Signing out…" : "Use a different account"}
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
