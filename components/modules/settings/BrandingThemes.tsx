"use client";

import { useState } from "react";
import { Check, Upload } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTheme } from "@/lib/theme-context";
import { THEMES, THEME_ORDER, type ThemeKey } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function BrandingThemes() {
  const { theme, setTheme } = useTheme();
  const [signature, setSignature] = useState(`Marcus Holloway
Managing Director · Nexvelon Global Inc.
240 Front Street West · Toronto, ON
(416) 555-0100 · marcus.reyes@nexvelon.com`);
  const [loginBg, setLoginBg] = useState("filigree-default");

  return (
    <div className="space-y-8">
      <Section
        title="Theme presets"
        description="Switch the entire workspace — sidebar, buttons, chart palette, badges. The active theme is stored locally and persists across reloads."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {THEME_ORDER.map((key) => (
            <ThemeCard
              key={key}
              themeKey={key}
              active={theme === key}
              onApply={() => {
                setTheme(key);
                toast.success(`${THEMES[key].name} applied`, {
                  description: "Theme persisted to this device.",
                });
              }}
            />
          ))}
        </div>
      </Section>

      <Section
        title="Logo"
        description="Upload your client-facing logo. Appears on PDFs, the login screen, and the sidebar header."
      >
        <Card className="bg-card flex items-center gap-4 p-4 shadow-sm">
          <div className="bg-brand-navy text-brand-gold flex h-16 w-16 items-center justify-center rounded-md font-serif text-2xl">
            N
          </div>
          <div className="flex-1">
            <p className="text-brand-charcoal text-sm font-semibold">Current logo</p>
            <p className="text-muted-foreground text-[11px]">
              SVG · 1024×1024 · uploaded Apr 8, 2026 by Marcus Holloway
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.success("Upload accepted (mock)")}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Replace
          </Button>
        </Card>
      </Section>

      <Section
        title="Login page background"
        description="Choose the pattern shown behind the wordmark on /login."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { key: "filigree-default", label: "Royal filigree", hint: "Default — diagonal lines + nodes" },
            { key: "damask", label: "Damask", hint: "Repeating brocade ornament" },
            { key: "plain", label: "Plain", hint: "No pattern — solid navy" },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => {
                setLoginBg(opt.key);
                toast.success(`Login background set to ${opt.label}`);
              }}
              className={cn(
                "bg-card rounded-lg border p-3 text-left transition-colors",
                loginBg === opt.key
                  ? "border-brand-gold ring-brand-gold/20 ring-2"
                  : "border-[var(--border)] hover:border-brand-gold/40"
              )}
            >
              <div className="bg-brand-navy text-brand-gold/40 flex h-20 items-center justify-center rounded-md font-mono text-[10px] tracking-widest uppercase">
                {opt.key === "plain" ? "" : opt.label}
              </div>
              <p className="text-brand-charcoal mt-2 text-xs font-semibold">
                {opt.label}
              </p>
              <p className="text-muted-foreground text-[10px]">{opt.hint}</p>
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Email signature template"
        description="Used on quote-sent and invoice-sent emails."
      >
        <Textarea
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          rows={5}
          className="font-mono text-xs"
        />
      </Section>

      <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
        <Button variant="ghost" size="sm">
          Cancel
        </Button>
        <Button
          size="sm"
          className="bg-brand-gold text-brand-navy hover:bg-brand-gold/90"
          onClick={() =>
            toast.success("Settings saved", {
              description: "Branding preferences updated.",
            })
          }
        >
          Save Changes
        </Button>
      </div>
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
      {description && (
        <p className="text-muted-foreground mb-3 text-xs">{description}</p>
      )}
      {children}
    </section>
  );
}

function ThemeCard({
  themeKey,
  active,
  onApply,
}: {
  themeKey: ThemeKey;
  active: boolean;
  onApply: () => void;
}) {
  const t = THEMES[themeKey];
  return (
    <button
      type="button"
      onClick={onApply}
      className={cn(
        "bg-card group rounded-lg border-2 p-3 text-left transition-shadow hover:shadow-md",
        active
          ? "border-brand-gold ring-brand-gold/20 ring-4"
          : "border-[var(--border)]"
      )}
    >
      {/* Mini mockup */}
      <div
        className="grid h-32 grid-cols-[20%_1fr] gap-1 overflow-hidden rounded"
        style={{ background: t.bg }}
      >
        <div style={{ background: t.primary }} className="flex flex-col items-center gap-1.5 py-2">
          <span
            className="block h-1.5 w-1.5 rounded-full"
            style={{ background: t.accent }}
          />
          <span className="block h-1 w-3 rounded-sm" style={{ background: t.accent }} />
          <span className="block h-1 w-3 rounded-sm" style={{ background: `${t.bg}66` }} />
          <span className="block h-1 w-3 rounded-sm" style={{ background: `${t.bg}66` }} />
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="flex items-center justify-between">
            <span className="block h-1.5 w-8 rounded-sm" style={{ background: t.text }} />
            <span className="block h-1 w-4 rounded-sm" style={{ background: t.accent }} />
          </div>
          <div className="bg-card rounded-sm p-1 shadow-sm" style={{ background: t.card }}>
            <span className="mb-1 block h-1 w-6 rounded-sm" style={{ background: t.accent }} />
            <span className="block h-3 w-full rounded-sm" style={{ background: t.muted }} />
          </div>
          <div
            className="flex h-10 items-end gap-1 rounded-sm p-1"
            style={{ background: t.muted }}
          >
            {[60, 90, 40, 75, 50].map((h, i) => (
              <span
                key={i}
                className="block w-1.5 rounded-sm"
                style={{
                  height: `${h}%`,
                  background: i % 2 === 0 ? t.primary : t.accent,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-brand-navy font-serif text-base font-semibold">
            {t.name}
          </p>
          <p className="text-muted-foreground text-[10px] leading-snug">
            {t.description}
          </p>
        </div>
        {active && (
          <span className="bg-brand-gold text-brand-navy inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">
            <Check className="h-2.5 w-2.5" />
            Active
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-1">
        {[t.primary, t.accent, t.bg, t.text, t.chartTertiary].map((c, i) => (
          <span
            key={i}
            className="h-3 w-3 rounded-full ring-1 ring-black/10"
            style={{ background: c }}
            title={c}
          />
        ))}
      </div>
    </button>
  );
}
