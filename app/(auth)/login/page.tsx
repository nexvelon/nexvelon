"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Eye,
  EyeOff,
  FileText,
  FolderKanban,
  Lock,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth/AuthProvider";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo-accounts";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signInAs, status } = useAuth();

  const [email, setEmail] = useState("admin@nexvelon.com");
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = signIn(email.trim(), password);
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    router.push("/dashboard");
  };

  const loginAs = (acctEmail: string) => {
    setError(null);
    setEmail(acctEmail);
    setPassword(DEMO_PASSWORD);
    signInAs(acctEmail);
    router.push("/dashboard");
  };

  return (
    <div
      className="grid min-h-screen grid-cols-1 lg:grid-cols-5"
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
          © 2026 Nexvelon Global Inc. · Holloway Security Integration Group · ULC Listed · ESA Licensed
        </div>
      </aside>

      <main className="flex items-center justify-center p-6 lg:col-span-2 lg:p-12">
        <div className="w-full max-w-md">
          <Card
            className="p-8 shadow-sm"
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

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="nx-eyebrow-soft text-[10px]">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="nx-eyebrow-soft text-[10px]">
                    Password
                  </Label>
                  <button
                    type="button"
                    className="text-[11px] hover:underline"
                    style={{ color: "var(--brand-primary)" }}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPwd ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="text-muted-foreground hover:text-brand-charcoal absolute top-1/2 right-3 -translate-y-1/2"
                    aria-label={showPwd ? "Hide password" : "Show password"}
                  >
                    {showPwd ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <label className="text-brand-charcoal flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  style={{ accentColor: "var(--brand-accent)" }}
                  className="h-3.5 w-3.5"
                />
                Remember me on this device
              </label>

              {error && (
                <div
                  className="flex items-start gap-2 rounded-md border px-3 py-2 text-xs"
                  style={{
                    background: "color-mix(in oklab, var(--brand-status-red) 10%, transparent)",
                    borderColor: "color-mix(in oklab, var(--brand-status-red) 35%, transparent)",
                    color: "var(--brand-status-red)",
                  }}
                >
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md py-3 text-sm font-semibold tracking-[0.04em] shadow-sm transition-shadow hover:shadow-md disabled:opacity-60"
                style={{
                  background: "var(--brand-accent)",
                  color: "var(--brand-primary)",
                  fontFamily: "var(--font-playfair), serif",
                }}
              >
                <Lock className="h-4 w-4" />
                Sign In
              </button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <span
                className="h-px flex-1"
                style={{ background: "var(--brand-border)" }}
              />
              <span
                className="font-mono text-[10px] uppercase tracking-widest"
                style={{ color: "var(--brand-accent)" }}
              >
                or
              </span>
              <span
                className="h-px flex-1"
                style={{ background: "var(--brand-border)" }}
              />
            </div>

            <div className="space-y-2">
              {SSO_BUTTONS.map((b) => (
                <button
                  key={b.label}
                  type="button"
                  onClick={() => handleSubmit()}
                  className="w-full rounded-md border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted/40"
                  style={{
                    borderColor: "color-mix(in oklab, var(--brand-accent) 35%, transparent)",
                    color: "var(--brand-text)",
                  }}
                >
                  {b.label}
                </button>
              ))}
            </div>

            <div className="mt-6 space-y-1 text-center">
              <p className="text-muted-foreground text-[11px]">
                Demo credentials:{" "}
                <span className="font-mono text-brand-charcoal">admin@nexvelon.com</span>{" "}/
                {" "}
                <span className="font-mono text-brand-charcoal">P@ssw0rd</span>
              </p>
              <p className="text-muted-foreground text-[11px]">
                Need access? Contact your administrator.
              </p>
            </div>
          </Card>

          <Card
            className="mt-4 overflow-hidden shadow-sm"
            style={{ borderTop: "2px solid var(--brand-accent)" }}
          >
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid var(--brand-border)" }}
            >
              <span className="inline-flex items-center gap-2">
                <ShieldCheck
                  className="h-3.5 w-3.5"
                  style={{ color: "var(--brand-accent)" }}
                />
                <span
                  className="font-serif text-sm"
                  style={{ color: "var(--brand-primary)" }}
                >
                  Demo accounts
                </span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                  style={{
                    background: "color-mix(in oklab, var(--brand-accent) 20%, transparent)",
                    color: "var(--brand-accent-soft)",
                  }}
                >
                  Live
                </span>
              </span>
            </div>
            <div className="p-4">
              <p className="text-muted-foreground mb-3 text-[11px]">
                One-click sign-in. Each chip switches your role and lands you
                on the dashboard with the same permissions wired live.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {DEMO_ACCOUNTS.map((d) => (
                  <button
                    key={d.email}
                    type="button"
                    onClick={() => loginAs(d.email)}
                    className={cn(
                      "group rounded-md border bg-white px-3 py-2 text-left transition-colors"
                    )}
                    style={{
                      borderColor: "color-mix(in oklab, var(--brand-primary) 15%, transparent)",
                    }}
                  >
                    <p
                      className="font-serif text-sm font-semibold"
                      style={{ color: "var(--brand-primary)" }}
                    >
                      {d.label}
                    </p>
                    <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[10px] leading-snug">
                      {d.blurb}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}

const SSO_BUTTONS = [
  { label: "Continue with Microsoft" },
  { label: "Continue with Google" },
  { label: "Continue with SSO (SAML)" },
];

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
          border: "1px solid color-mix(in oklab, var(--brand-accent) 50%, transparent)",
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
