"use client";

// UIDG-3 — theme selection now PERSISTS. Picking a preset writes the current
// user's override (setMyThemeAction); an Admin can set the company-wide default
// (setOrgDefaultThemeAction), visibly separate from the personal choice. The
// Logo / login-background / email-signature sections are still not wired to a
// backend — they are labelled "preview only" rather than showing a fake save.

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, Info, RotateCcw, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/auth/AuthProvider";
import { ROLE_LABELS } from "@/lib/permissions";
import { useTheme } from "@/lib/theme-context";
import { THEMES, THEME_ORDER, type ThemeKey } from "@/lib/theme";
import { cn } from "@/lib/utils";
import {
  getThemeSettingsAction,
  setMyThemeAction,
  setOrgDefaultThemeAction,
} from "@/app/(app)/settings/theme-actions";

export function BrandingThemes() {
  const { theme, setTheme } = useTheme();
  const { user, profile } = useAuth();

  const [orgDefaultKey, setOrgDefaultKey] = useState<ThemeKey | null>(null);
  const [hasOverride, setHasOverride] = useState(false);
  const [canManageOrg, setCanManageOrg] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    getThemeSettingsAction().then((res) => {
      if (res.ok) {
        setOrgDefaultKey(res.data.orgDefaultKey);
        setHasOverride(res.data.userOverrideKey !== null);
        setCanManageOrg(res.data.canManageOrg);
      }
      setLoaded(true);
    });
  }, []);

  // Apply a preset as the signed-in user's personal theme — optimistic, reverts
  // on failure.
  const applyMyTheme = (key: ThemeKey) => {
    if (pending) return;
    const prev = theme;
    setTheme(key);
    startTransition(async () => {
      const res = await setMyThemeAction(key);
      if (!res.ok) {
        setTheme(prev);
        toast.error(res.error);
        return;
      }
      setHasOverride(true);
      setOrgDefaultKey(res.data.orgDefaultKey);
      toast.success(`${THEMES[key].name} applied`, {
        description: "Saved to your account — it follows you across devices.",
      });
    });
  };

  const resetToOrgDefault = () => {
    if (pending || !orgDefaultKey) return;
    const prev = theme;
    setTheme(orgDefaultKey);
    startTransition(async () => {
      const res = await setMyThemeAction(null);
      if (!res.ok) {
        setTheme(prev);
        toast.error(res.error);
        return;
      }
      setHasOverride(false);
      toast.success("Reverted to the company default", {
        description: THEMES[orgDefaultKey].name,
      });
    });
  };

  const setOrgDefault = (key: ThemeKey) => {
    if (pending) return;
    startTransition(async () => {
      const res = await setOrgDefaultThemeAction(key);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setOrgDefaultKey(res.data.orgDefaultKey);
      toast.success(`Company default set to ${THEMES[key].name}`, {
        description: "Applies to everyone who hasn't chosen their own theme.",
      });
    });
  };

  const signature = useSignatureTemplate(user, profile);

  return (
    <div className="space-y-8">
      <Section
        title="Your theme"
        description="Pick your workspace theme — sidebar, buttons, chart palette, badges. Your choice is saved to your account and follows you across devices."
      >
        {loaded && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            {hasOverride ? (
              <>
                <span className="text-muted-foreground">
                  You&apos;ve chosen a personal theme.
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={resetToOrgDefault}
                  disabled={pending || !orgDefaultKey}
                >
                  <RotateCcw className="mr-1 h-3 w-3" />
                  Reset to company default
                  {orgDefaultKey ? ` (${THEMES[orgDefaultKey].name})` : ""}
                </Button>
              </>
            ) : (
              <span className="text-muted-foreground inline-flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5" />
                Using the company default
                {orgDefaultKey ? ` (${THEMES[orgDefaultKey].name})` : ""}.
              </span>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {THEME_ORDER.map((key) => (
            <ThemeCard
              key={key}
              themeKey={key}
              active={theme === key}
              isOrgDefault={orgDefaultKey === key}
              canManageOrg={canManageOrg}
              pending={pending}
              onApply={() => applyMyTheme(key)}
              onSetOrgDefault={() => setOrgDefault(key)}
            />
          ))}
        </div>

        {canManageOrg && (
          <p className="text-muted-foreground mt-3 inline-flex items-center gap-1.5 text-[11px]">
            <Building2 className="h-3.5 w-3.5" />
            As an admin, use “Set as company default” on a card to change the
            theme new and non-customised users see. That is separate from your
            personal choice above.
          </p>
        )}
      </Section>

      {/* The sections below are not yet wired to a backend. They are shown as
          previews rather than claiming to save (UIDG-3 known debt). */}
      <Section
        title="Logo"
        description="Preview only — logo upload isn't saved yet."
      >
        <Card className="bg-card flex items-center gap-4 p-4 opacity-70 shadow-sm">
          <div className="bg-brand-navy text-brand-gold flex h-16 w-16 items-center justify-center rounded-md font-serif text-2xl">
            N
          </div>
          <div className="flex-1">
            <p className="text-brand-charcoal text-sm font-semibold">Current logo</p>
            <p className="text-muted-foreground text-[11px]">
              SVG · 1024×1024 · placeholder N-glyph
            </p>
          </div>
          <Button variant="outline" size="sm" disabled title="Coming soon">
            Replace (soon)
          </Button>
        </Card>
      </Section>

      <Section
        title="Login page background"
        description="Preview only — this selection isn't saved yet."
      >
        <LoginBackgroundPreview />
      </Section>

      <Section
        title="Email signature template"
        description="Preview only — the signature isn't saved yet."
      >
        <Textarea
          defaultValue={signature}
          rows={5}
          className="font-mono text-xs opacity-80"
          aria-label="Email signature preview"
        />
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
    const lines = [
      user.name,
      `${titleLine} · Nexvelon Global Inc.`,
      phone ? `${phone} · ${user.email}` : user.email,
    ].filter(Boolean);
    return lines.join("\n");
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
  isOrgDefault,
  canManageOrg,
  pending,
  onApply,
  onSetOrgDefault,
}: {
  themeKey: ThemeKey;
  active: boolean;
  isOrgDefault: boolean;
  canManageOrg: boolean;
  pending: boolean;
  onApply: () => void;
  onSetOrgDefault: () => void;
}) {
  const t = THEMES[themeKey];
  return (
    <div
      className={cn(
        "bg-card group rounded-lg border-2 p-3 transition-shadow hover:shadow-md",
        active ? "border-brand-gold ring-brand-gold/20 ring-4" : "border-[var(--border)]"
      )}
    >
      {/* Click the mockup to apply as YOUR theme. */}
      <button
        type="button"
        onClick={onApply}
        disabled={pending}
        className="w-full text-left disabled:cursor-not-allowed"
        aria-label={`Apply ${t.name} as my theme`}
      >
        <div
          className="grid h-32 grid-cols-[20%_1fr] gap-1 overflow-hidden rounded"
          style={{ background: t.bg }}
        >
          <div style={{ background: t.primary }} className="flex flex-col items-center gap-1.5 py-2">
            <span className="block h-1.5 w-1.5 rounded-full" style={{ background: t.accent }} />
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
            <div className="flex h-10 items-end gap-1 rounded-sm p-1" style={{ background: t.muted }}>
              {[60, 90, 40, 75, 50].map((h, i) => (
                <span
                  key={i}
                  className="block w-1.5 rounded-sm"
                  style={{ height: `${h}%`, background: i % 2 === 0 ? t.primary : t.accent }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-brand-navy font-serif text-base font-semibold">{t.name}</p>
            <p className="text-muted-foreground text-[10px] leading-snug">{t.description}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {active && (
              <span className="bg-brand-gold text-brand-navy inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                <Check className="h-2.5 w-2.5" />
                Active
              </span>
            )}
            {isOrgDefault && (
              <span className="text-muted-foreground inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider">
                <Building2 className="h-2.5 w-2.5" />
                Company
              </span>
            )}
          </div>
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

      {canManageOrg && (
        <div className="mt-2 border-t border-[var(--border)] pt-2">
          <button
            type="button"
            onClick={onSetOrgDefault}
            disabled={pending || isOrgDefault}
            className="text-brand-navy inline-flex items-center gap-1 text-[10px] font-medium hover:underline disabled:text-muted-foreground disabled:no-underline"
          >
            <Building2 className="h-3 w-3" />
            {isOrgDefault ? "Company default" : "Set as company default"}
          </button>
        </div>
      )}
    </div>
  );
}
