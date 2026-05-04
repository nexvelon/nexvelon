"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Eye,
  EyeOff,
  FileText,
  FolderKanban,
  Lock,
  Receipt,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAction } from "./actions";

// ============================================================================
// Real two-step sign-in (Session A onwards).
//
// STEP 1 (this page):  email + password → server action → on success the
//                      user has a Supabase session AND a fresh OTP row;
//                      we redirect to /auth/verify-otp where step 2 lives.
//
// STEP 2 (/auth/verify-otp): six-digit code entry. Until it's verified the
//                      middleware redirects every protected route here.
//
// The visual design is the v4.18 navy + gold split-screen, with:
//   - Demo chips and SSO buttons removed (real auth doesn't expose them).
//   - Min mobile width 320px; touch targets 44px+ on every interactive.
// ============================================================================

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Surface a one-shot error from /auth/callback redirects (expired link, etc.)
  useEffect(() => {
    const e = searchParams.get("error");
    if (e) setError(e);
  }, [searchParams]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Email and password are required.");
      return;
    }

    startTransition(async () => {
      const result = await signInAction(trimmedEmail, password);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Preserve a "next" param so post-OTP we can land on the originally
      // requested page (verify-otp will pass it forward).
      const next = searchParams.get("next");
      const dest = next
        ? `${result.redirectTo}?next=${encodeURIComponent(next)}`
        : result.redirectTo;
      router.replace(dest);
    });
  };

  return (
    <div
      className="grid min-h-[100dvh] grid-cols-1 lg:grid-cols-5"
      style={{ background: "var(--brand-bg)" }}
    >
      <aside
        className="relative hidden flex-col justify-between overflow-hidden p-12 lg:col-span-3 lg:flex"
        style={{ background: "var(--brand-primary)", color: "var(--brand-bg)" }}
      >
        <Filigree />
        <div className="relative z-10">
          <div
            className="font-mono text-[10px] uppercase tracking-[0.4em]"
            style={{ color: "rgba(245,241,232,0.55)" }}
          >
            Nexvelon Global Inc.
          </div>
        </div>

        <div className="relative z-10 flex flex-col items-center justify-center text-center">
          <div className="mb-8 flex items-center gap-4">
            <span
              className="flex h-12 w-12 items-center justify-center font-serif text-xl"
              style={{
                border: "1px solid var(--brand-accent)",
                color: "var(--brand-accent)",
              }}
              aria-hidden
            >
              N
            </span>
          </div>
          <h1
            className="font-serif text-7xl"
            style={{ color: "var(--brand-bg)", letterSpacing: "0.06em" }}
          >
            Nexvelon
          </h1>
          <span
            className="mt-3 block h-px w-32"
            style={{ background: "var(--brand-accent)" }}
          />
          <p
            className="nx-subtitle mt-5 text-lg"
            style={{ color: "rgba(245,241,232,0.7)" }}
          >
            Field operations, refined.
          </p>

          <ul className="mt-12 flex items-center gap-12">
            <PillarItem icon={FileText} label="Quotes" />
            <PillarItem icon={FolderKanban} label="Projects" />
            <PillarItem icon={Receipt} label="Financials" />
          </ul>
        </div>

        <div
          className="relative z-10 font-mono text-[10px] uppercase tracking-[0.25em]"
          style={{ color: "rgba(245,241,232,0.4)" }}
        >
          © 2026 Nexvelon Global Inc.
        </div>
      </aside>

      <main className="flex items-center justify-center p-4 sm:p-6 lg:col-span-2 lg:p-12">
        <div className="w-full max-w-md">
          <Card
            className="p-6 shadow-sm sm:p-8"
            style={{
              borderTop: "2px solid var(--brand-accent)",
              background: "var(--brand-card)",
            }}
          >
            <p className="nx-eyebrow mb-3">Workspace Sign-in</p>
            <h2
              className="font-serif text-3xl"
              style={{ color: "var(--brand-primary)" }}
            >
              Welcome back
            </h2>
            <p className="nx-subtitle mt-1 text-sm">
              Sign in to your Nexvelon workspace.
            </p>
            <div className="nx-rule mt-4 mb-5" />

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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

              <div className="space-y-1.5">
                <Label
                  htmlFor="password"
                  className="nx-eyebrow-soft text-[10px]"
                >
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPwd ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    disabled={pending}
                    className="h-11 pr-12"
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
                <Lock className="h-4 w-4" />
                {pending ? "Sending verification code…" : "Sign In"}
              </button>
            </form>

            <p className="text-muted-foreground mt-6 text-center text-[11px]">
              Forgot password? Contact your administrator.
            </p>
            <p className="text-muted-foreground mt-1 text-center text-[11px]">
              For your security every sign-in requires a code we email you.
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
}

function PillarItem({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <li className="flex flex-col items-center gap-1.5">
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full"
        style={{
          border:
            "1px solid color-mix(in oklab, var(--brand-accent) 50%, transparent)",
          color: "var(--brand-accent)",
        }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span
        className="font-mono text-[10px] uppercase tracking-[0.25em]"
        style={{ color: "rgba(245,241,232,0.7)" }}
      >
        {label}
      </span>
    </li>
  );
}

function Filigree() {
  return (
    <svg
      className="absolute inset-0 h-full w-full opacity-[0.05]"
      aria-hidden
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern
          id="filigree"
          width="64"
          height="64"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="64"
            stroke="var(--brand-accent)"
            strokeWidth="1"
          />
          <line
            x1="32"
            y1="0"
            x2="32"
            y2="64"
            stroke="var(--brand-accent)"
            strokeWidth="0.5"
          />
          <circle cx="32" cy="32" r="1.2" fill="var(--brand-accent)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#filigree)" />
    </svg>
  );
}
