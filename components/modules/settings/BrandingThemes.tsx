"use client";

// Settings → "Branding & Themes". The theme picker + custom-theme editor live in
// ThemeStudio (UIDG-4). Logo / login-background / email-signature remain unwired
// and are labelled "preview only" (UIDG-3 debt) — no fake success toasts.

import { useMemo, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/components/auth/AuthProvider";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { ThemeStudio } from "@/components/modules/settings/ThemeStudio";

export function BrandingThemes() {
  const { user, profile } = useAuth();
  const signature = useSignatureTemplate(user, profile);

  return (
    <div className="space-y-8">
      <Section
        title="Themes"
        description="Pick a theme, or build your own by duplicating one and editing its colours and fonts. Your choice is saved to your account and follows you across devices."
      >
        <ThemeStudio />
      </Section>

      <Section title="Logo" description="Preview only — logo upload isn't saved yet.">
        <Card className="bg-card flex items-center gap-4 p-4 opacity-70 shadow-sm">
          <div className="bg-brand-navy text-brand-gold flex h-16 w-16 items-center justify-center rounded-md font-serif text-2xl">
            N
          </div>
          <div className="flex-1">
            <p className="text-brand-charcoal text-sm font-semibold">Current logo</p>
            <p className="text-muted-foreground text-[11px]">SVG · 1024×1024 · placeholder N-glyph</p>
          </div>
          <Button variant="outline" size="sm" disabled title="Coming soon">
            Replace (soon)
          </Button>
        </Card>
      </Section>

      <Section title="Login page background" description="Preview only — this selection isn't saved yet.">
        <LoginBackgroundPreview />
      </Section>

      <Section title="Email signature template" description="Preview only — the signature isn't saved yet.">
        <Textarea defaultValue={signature} rows={5} className="font-mono text-xs opacity-80" aria-label="Email signature preview" />
      </Section>
    </div>
  );
}

function useSignatureTemplate(
  user: ReturnType<typeof useAuth>["user"],
  profile: ReturnType<typeof useAuth>["profile"]
): string {
  return useMemo(() => {
    if (!user) return "";
    const titleLine = ROLE_LABELS[user.role] ?? "Nexvelon Enterprise Suite";
    const phone = profile?.phone ?? profile?.mobile ?? null;
    return [user.name, `${titleLine} · Nexvelon Global Inc.`, phone ? `${phone} · ${user.email}` : user.email]
      .filter(Boolean)
      .join("\n");
  }, [user, profile]);
}

function LoginBackgroundPreview() {
  const [selected, setSelected] = useState("filigree-default");
  const options = [
    { key: "filigree-default", label: "Royal filigree", hint: "Default — diagonal lines + nodes" },
    { key: "damask", label: "Damask", hint: "Repeating brocade ornament" },
    { key: "plain", label: "Plain", hint: "No pattern — solid navy" },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => setSelected(opt.key)}
          className={cn(
            "bg-card rounded-lg border p-3 text-left transition-colors",
            selected === opt.key
              ? "border-brand-gold ring-brand-gold/20 ring-2"
              : "border-[var(--border)] hover:border-brand-gold/40"
          )}
        >
          <div className="bg-brand-navy text-brand-gold/40 flex h-20 items-center justify-center rounded-md font-mono text-[10px] tracking-widest uppercase">
            {opt.key === "plain" ? "" : opt.label}
          </div>
          <p className="text-brand-charcoal mt-2 text-xs font-semibold">{opt.label}</p>
          <p className="text-muted-foreground text-[10px]">{opt.hint}</p>
        </button>
      ))}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-brand-navy mb-1 font-serif text-lg">{title}</h3>
      {description && <p className="text-muted-foreground mb-3 text-xs">{description}</p>}
      {children}
    </section>
  );
}
