"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
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
import { Button } from "@/components/ui/button";
import { useRole } from "@/lib/role-context";
import {
  DEMO_ACCOUNTS,
  findDemoAccountByEmail,
  type DemoAccount,
} from "@/lib/demo-accounts";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const { setRole } = useRole();
  const [email, setEmail] = useState("admin@nexvelon.com");
  const [password, setPassword] = useState("demo");
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);
  const [demoOpen, setDemoOpen] = useState(true);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const acct = findDemoAccountByEmail(email) ?? DEMO_ACCOUNTS[0];
    setRole(acct.role);
    router.push("/dashboard");
  };

  const loginAs = (acct: DemoAccount) => {
    setEmail(acct.email);
    setPassword(acct.password);
    setRole(acct.role);
    router.push("/dashboard");
  };

  return (
    <div className="bg-brand-ivory grid min-h-screen grid-cols-1 lg:grid-cols-5">
      {/* LEFT — navy with filigree, brand copy */}
      <aside className="bg-brand-navy text-brand-ivory relative hidden flex-col justify-between overflow-hidden p-12 lg:col-span-3 lg:flex">
        <Filigree />
        <div className="relative z-10">
          <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-brand-ivory/50">
            Nexvelon Global Inc.
          </div>
        </div>

        <div className="relative z-10 flex flex-col items-center justify-center text-center">
          <h1 className="text-brand-ivory font-serif text-7xl tracking-[0.04em]">
            Nexvelon
          </h1>
          <span className="bg-brand-gold mt-3 block h-px w-32" />
          <p className="text-brand-ivory/70 mt-5 font-serif text-lg italic">
            Field operations, refined.
          </p>

          <ul className="mt-12 flex items-center gap-12">
            <PillarItem icon={FileText} label="Quotes" />
            <PillarItem icon={FolderKanban} label="Projects" />
            <PillarItem icon={Receipt} label="Financials" />
          </ul>
        </div>

        <div className="relative z-10 text-brand-ivory/40 font-mono text-[10px] uppercase tracking-[0.25em]">
          © 2026 Nexvelon Global Inc. · ULC Listed · ESA Licensed
        </div>
      </aside>

      {/* RIGHT — ivory login card */}
      <main className="flex items-center justify-center p-6 lg:col-span-2 lg:p-12">
        <div className="w-full max-w-md">
          <Card className="border-t-2 border-t-[#C9A24B] p-8 shadow-sm">
            <h2 className="text-brand-navy font-serif text-3xl">Welcome back</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Sign in to your Nexvelon workspace.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs">
                    Password
                  </Label>
                  <button
                    type="button"
                    className="text-brand-navy hover:text-brand-gold text-[11px] hover:underline"
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
                  className="accent-brand-gold h-3.5 w-3.5"
                />
                Remember me on this device
              </label>

              <Button
                type="submit"
                className="bg-brand-gold text-brand-navy hover:bg-brand-gold/90 w-full font-semibold tracking-wide shadow-sm"
                size="lg"
              >
                <Lock className="mr-2 h-4 w-4" />
                Sign In
              </Button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <span className="bg-border h-px flex-1" />
              <span className="text-brand-gold font-mono text-[10px] uppercase tracking-widest">
                or
              </span>
              <span className="bg-border h-px flex-1" />
            </div>

            <div className="space-y-2">
              {SSO_BUTTONS.map((b) => (
                <Button
                  key={b.label}
                  type="button"
                  variant="outline"
                  size="lg"
                  className="border-brand-gold/40 text-brand-charcoal hover:bg-brand-gold/10 w-full justify-center font-medium"
                  onClick={() => handleSubmit()}
                >
                  {b.label}
                </Button>
              ))}
            </div>

            <p className="text-muted-foreground mt-6 text-center text-[11px]">
              Need access? Contact your administrator.
            </p>
          </Card>

          {/* Demo accounts panel */}
          <Card className="mt-4 overflow-hidden border-t-2 border-t-[#C9A24B] shadow-sm">
            <button
              type="button"
              onClick={() => setDemoOpen((o) => !o)}
              className="hover:bg-muted/40 flex w-full items-center justify-between px-4 py-3 transition-colors"
            >
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="text-brand-gold h-3.5 w-3.5" />
                <span className="text-brand-navy font-serif text-sm">
                  Demo accounts
                </span>
                <span className="bg-brand-gold/15 text-amber-800 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider">
                  Live
                </span>
              </span>
              {demoOpen ? (
                <ChevronUp className="text-muted-foreground h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="text-muted-foreground h-3.5 w-3.5" />
              )}
            </button>
            {demoOpen && (
              <div className="border-t border-[var(--border)] p-4">
                <p className="text-muted-foreground mb-3 text-[11px]">
                  One-click sign-in. Each chip switches your role and lands you
                  on the dashboard with the same permissions wired live across
                  every module.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {DEMO_ACCOUNTS.map((d) => (
                    <button
                      key={d.email}
                      type="button"
                      onClick={() => loginAs(d)}
                      className={cn(
                        "border-brand-navy/15 hover:border-brand-gold hover:bg-brand-gold/5 group rounded-md border bg-white px-3 py-2 text-left transition-colors"
                      )}
                    >
                      <p className="text-brand-navy font-serif text-sm font-semibold">
                        {d.label}
                      </p>
                      <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[10px] leading-snug">
                        {d.blurb}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
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
      <span className="ring-brand-gold/40 flex h-9 w-9 items-center justify-center rounded-full ring-1">
        <Icon className="text-brand-gold h-4 w-4" />
      </span>
      <span className="text-brand-ivory/70 font-mono text-[10px] uppercase tracking-[0.25em]">
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
          <line x1="0" y1="0" x2="0" y2="64" stroke="#C9A24B" strokeWidth="1" />
          <line
            x1="32"
            y1="0"
            x2="32"
            y2="64"
            stroke="#C9A24B"
            strokeWidth="0.5"
          />
          <circle cx="32" cy="32" r="1.2" fill="#C9A24B" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#filigree)" />
    </svg>
  );
}
