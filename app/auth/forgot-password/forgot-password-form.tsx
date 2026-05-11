"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertCircle, ArrowLeft, MailCheck, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordResetAction } from "./actions";

// ============================================================================
// Client form. Email-only input, single submit. Server action always
// returns { ok: true } regardless of whether the email matched an account
// (no account-enumeration leak); on success we flip to a "Check your
// inbox" confirmation state.
//
// Visual chrome mirrors /auth/set-password (centered card on parchment,
// navy + gold, Cormorant Garamond, gold uppercase tracked eyebrow).
// ============================================================================

interface ForgotPasswordFormProps {
  expired: boolean;
}

export function ForgotPasswordForm({ expired }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Please enter your email.");
      return;
    }
    if (!trimmed.includes("@")) {
      setError("That doesn't look like an email address.");
      return;
    }

    startTransition(async () => {
      const result = await requestPasswordResetAction({ email: trimmed });
      if (!result.ok) {
        // Defensive — the action is designed to always return ok:true, but
        // if it ever returns a failure we surface it.
        setError("Something went wrong. Please try again in a moment.");
        return;
      }
      setSubmittedEmail(trimmed);
      setSubmitted(true);
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
          {submitted ? (
            <SuccessState email={submittedEmail} />
          ) : (
            <FormState
              email={email}
              setEmail={setEmail}
              expired={expired}
              error={error}
              pending={pending}
              onSubmit={handleSubmit}
            />
          )}
        </Card>
      </div>
    </div>
  );
}

function FormState({
  email,
  setEmail,
  expired,
  error,
  pending,
  onSubmit,
}: {
  email: string;
  setEmail: (v: string) => void;
  expired: boolean;
  error: string | null;
  pending: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <>
      <p className="nx-eyebrow mb-3">Account Recovery</p>
      <h2
        className="font-serif text-2xl sm:text-3xl"
        style={{ color: "var(--brand-primary)" }}
      >
        Forgot your password?
      </h2>
      <p className="nx-subtitle mt-2 text-sm">
        Enter the email on your Nexvelon account. We&rsquo;ll send a single-use
        link to reset it.
      </p>
      <div className="nx-rule mt-4 mb-5" />

      {expired && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border px-3 py-2 text-xs"
          style={{
            background:
              "color-mix(in oklab, var(--brand-accent) 10%, transparent)",
            borderColor:
              "color-mix(in oklab, var(--brand-accent) 35%, transparent)",
            color: "var(--brand-primary)",
          }}
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            That reset link expired or was already used. Request a fresh one
            below.
          </span>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email" className="nx-eyebrow-soft text-[10px]">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            required
            disabled={pending}
            className="h-11"
          />
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
          disabled={pending}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md py-3 text-sm font-semibold tracking-[0.04em] shadow-sm transition-shadow hover:shadow-md disabled:opacity-60"
          style={{
            background: "var(--brand-accent)",
            color: "var(--brand-primary)",
            fontFamily: "var(--font-playfair), serif",
          }}
        >
          <Send className="h-4 w-4" />
          {pending ? "Sending reset link…" : "Send reset link"}
        </button>
      </form>

      <div className="mt-6 text-center">
        <Link
          href="/login"
          className="text-muted-foreground hover:text-brand-charcoal inline-flex items-center gap-1.5 text-[11px] tracking-[0.04em] transition"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to sign-in
        </Link>
      </div>
    </>
  );
}

function SuccessState({ email }: { email: string }) {
  return (
    <>
      <p className="nx-eyebrow mb-3">Check Your Inbox</p>
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
          <MailCheck className="h-4 w-4" />
        </span>
        <h2
          className="font-serif text-2xl sm:text-3xl"
          style={{ color: "var(--brand-primary)" }}
        >
          Reset link sent
        </h2>
      </div>
      <p className="nx-subtitle mt-2 text-sm">
        If an account exists for{" "}
        <span style={{ color: "var(--brand-primary)" }}>{email}</span>, a
        single-use reset link is on its way.
      </p>
      <div className="nx-rule mt-4 mb-5" />

      <ul className="space-y-2 text-sm" style={{ color: "var(--brand-text)" }}>
        <li className="flex items-start gap-2">
          <span
            className="mt-2 h-1 w-1 shrink-0 rounded-full"
            style={{ background: "var(--brand-accent)" }}
            aria-hidden
          />
          <span>
            Open the email titled{" "}
            <em>&ldquo;Reset your Nexvelon password&rdquo;</em>.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span
            className="mt-2 h-1 w-1 shrink-0 rounded-full"
            style={{ background: "var(--brand-accent)" }}
            aria-hidden
          />
          <span>Click the gold button within an hour — the link is single-use.</span>
        </li>
        <li className="flex items-start gap-2">
          <span
            className="mt-2 h-1 w-1 shrink-0 rounded-full"
            style={{ background: "var(--brand-accent)" }}
            aria-hidden
          />
          <span>
            Set a new password. We&rsquo;ll bring you back here to sign in.
          </span>
        </li>
      </ul>

      <p className="text-muted-foreground mt-6 text-center text-[11px]">
        Didn&rsquo;t get it? Check spam, then{" "}
        <Link
          href="/auth/forgot-password"
          className="underline"
          style={{ color: "var(--brand-primary)" }}
        >
          try again
        </Link>
        .
      </p>
      <p className="mt-2 text-center">
        <Link
          href="/login"
          className="text-muted-foreground hover:text-brand-charcoal inline-flex items-center gap-1.5 text-[11px] tracking-[0.04em] transition"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to sign-in
        </Link>
      </p>
    </>
  );
}
