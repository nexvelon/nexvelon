"use client";

// UIDG-4 — the theme studio: browse built-in + custom themes, apply one as your
// personal theme, and build your own by duplicating an existing theme and editing
// every token with a LIVE preview (the whole app retints as you edit; leaving
// without saving restores the previously-applied theme). Admins can publish a
// theme org-wide and set the company default.

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, Copy, Pencil, Trash2, Building2, Info, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ColorInput } from "@/components/ui/color-input";
import { useTheme } from "@/lib/theme-context";
import {
  DEFAULT_FONTS,
  THEME_COLOR_TOKEN_KEYS,
  resolveTheme,
  type ResolvedThemeColors,
  type ThemeKey,
  type ThemeTokens,
} from "@/lib/theme";
import { checkContrast, validateThemeTokens } from "@/lib/theme-validate";
import { cn } from "@/lib/utils";
import {
  getThemeStudioAction,
  setMyThemeAction,
  setOrgDefaultThemeAction,
  duplicateThemeAction,
  updateCustomThemeAction,
  deleteCustomThemeAction,
  publishCustomThemeAction,
  unpublishCustomThemeAction,
  type ThemeStudioData,
} from "@/app/(app)/settings/theme-actions";

const COLOR_LABELS: Record<(typeof THEME_COLOR_TOKEN_KEYS)[number], string> = {
  primary: "Primary",
  accent: "Accent",
  accentSoft: "Accent (soft)",
  bg: "Background",
  text: "Text",
  card: "Card",
  border: "Border",
  muted: "Muted",
  sidebarAccent: "Sidebar accent",
  sidebarBorder: "Sidebar border",
  chartTertiary: "Chart tertiary",
  chartQuaternary: "Chart quaternary",
  statusGreen: "Status green",
  statusRed: "Status red",
};

const FONT_LABELS: Record<string, string> = {
  [DEFAULT_FONTS.sans]: "Inter (sans)",
  [DEFAULT_FONTS.serif]: "Playfair Display (serif)",
  [DEFAULT_FONTS.mono]: "Geist Mono (mono)",
};
const FONT_VALUES = [DEFAULT_FONTS.sans, DEFAULT_FONTS.serif, DEFAULT_FONTS.mono];

function resolvedFrom(id: string, name: string, tokens: ThemeTokens): ResolvedThemeColors {
  return { key: id, name, description: "", ...tokens };
}

export function ThemeStudio() {
  const { theme, setTheme } = useTheme();
  const [data, setData] = useState<ThemeStudioData | null>(null);
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = () => getThemeStudioAction().then((r) => r.ok && setData(r.data));
  useEffect(() => {
    load();
  }, []);

  const hasOverride = data?.userOverrideKey != null;
  const orgName = useMemo(() => {
    if (!data) return "";
    const k = data.orgDefaultKey;
    return (
      data.builtins.find((b) => b.key === k)?.name ??
      data.customs.find((c) => c.id === k)?.name ??
      k
    );
  }, [data]);

  // ── apply / reset ──
  const applyBuiltin = (key: string, name: string) => {
    if (pending) return;
    const prev = theme;
    setTheme(key); // optimistic (built-in resolves internally)
    startTransition(async () => {
      const res = await setMyThemeAction(key);
      if (!res.ok) {
        setTheme(prev);
        toast.error(res.error);
        return;
      }
      setData((d) => (d ? { ...d, userOverrideKey: key } : d));
      toast.success(`${name} applied`);
    });
  };
  const applyCustom = (id: string, name: string, tokens: ThemeTokens) => {
    if (pending) return;
    const prev = theme;
    setTheme(id, resolvedFrom(id, name, tokens));
    startTransition(async () => {
      const res = await setMyThemeAction(id);
      if (!res.ok) {
        setTheme(prev);
        toast.error(res.error);
        return;
      }
      setData((d) => (d ? { ...d, userOverrideKey: id } : d));
      toast.success(`${name} applied`);
    });
  };
  const resetToOrg = () => {
    if (pending || !data) return;
    setTheme(data.orgDefaultKey);
    startTransition(async () => {
      const res = await setMyThemeAction(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setData((d) => (d ? { ...d, userOverrideKey: null } : d));
      toast.success("Reverted to the company default");
    });
  };

  // ── admin: publish / default ──
  const setOrgDefault = (key: string, name: string) =>
    startTransition(async () => {
      const res = await setOrgDefaultThemeAction(key);
      if (!res.ok) { toast.error(res.error); return; }
      setData((d) => (d ? { ...d, orgDefaultKey: key } : d));
      toast.success(`Company default set to ${name}`);
    });
  const togglePublish = (id: string, published: boolean) =>
    startTransition(async () => {
      const res = published
        ? await unpublishCustomThemeAction(id)
        : await publishCustomThemeAction(id);
      if (!res.ok) { toast.error(res.error); return; }
      load();
      toast.success(published ? "Unpublished" : "Published org-wide");
    });

  // ── create / edit / delete ──
  const duplicate = (sourceKey: string) =>
    startTransition(async () => {
      const res = await duplicateThemeAction(sourceKey);
      if (!res.ok) { toast.error(res.error); return; }
      await load();
      setEditingId(res.data.id);
      toast.success(`Created "${res.data.name}" — edit and save`);
    });
  const remove = (id: string, name: string) => {
    if (!confirm(`Delete the theme "${name}"? Anyone using it falls back to the company default.`)) return;
    startTransition(async () => {
      const res = await deleteCustomThemeAction(id);
      if (!res.ok) { toast.error(res.error); return; }
      load();
      toast.success("Theme deleted");
    });
  };

  if (!data) {
    return <p className="text-muted-foreground text-sm">Loading themes…</p>;
  }

  const editingTheme = data.customs.find((c) => c.id === editingId) ?? null;

  return (
    <div className="space-y-4">
      {/* Status line */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {hasOverride ? (
          <>
            <span className="text-muted-foreground">You&apos;ve chosen a personal theme.</span>
            <Button type="button" variant="outline" size="xs" onClick={resetToOrg} disabled={pending}>
              <RotateCcw className="mr-1 h-3 w-3" /> Reset to company default ({orgName})
            </Button>
          </>
        ) : (
          <span className="text-muted-foreground inline-flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" /> Using the company default ({orgName}).
          </span>
        )}
      </div>

      {editingTheme && (
        <ThemeEditor
          key={editingTheme.id}
          id={editingTheme.id}
          initialName={editingTheme.name}
          initialTokens={editingTheme.tokens}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            load();
            setEditingId(null);
          }}
        />
      )}

      {/* Built-in presets */}
      <div>
        <h4 className="text-muted-foreground mb-2 text-[11px] font-semibold uppercase tracking-wide">
          Built-in presets
        </h4>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {data.builtins.map((b) => (
            <ThemeRow
              key={b.key}
              name={b.name}
              swatches={swatchesForBuiltin(b.key)}
              active={theme === b.key}
              isOrgDefault={data.orgDefaultKey === b.key}
              pending={pending}
              onApply={() => applyBuiltin(b.key, b.name)}
              onDuplicate={() => duplicate(b.key)}
              canManageOrg={data.canManageOrg}
              onSetOrgDefault={() => setOrgDefault(b.key, b.name)}
            />
          ))}
        </div>
      </div>

      {/* Custom themes */}
      <div>
        <h4 className="text-muted-foreground mb-2 text-[11px] font-semibold uppercase tracking-wide">
          Custom themes
        </h4>
        {data.customs.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            None yet. Duplicate a preset above to create one.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {data.customs.map((c) => (
              <ThemeRow
                key={c.id}
                name={c.name}
                swatches={[c.tokens.primary, c.tokens.accent, c.tokens.bg, c.tokens.text, c.tokens.chartTertiary]}
                active={theme === c.id}
                isOrgDefault={data.orgDefaultKey === c.id}
                published={c.isPublished}
                mine={c.isMine}
                pending={pending}
                onApply={() => applyCustom(c.id, c.name, c.tokens)}
                onDuplicate={() => duplicate(c.id)}
                onEdit={c.isMine || data.canManageOrg ? () => setEditingId(c.id) : undefined}
                onDelete={c.isMine || data.canManageOrg ? () => remove(c.id, c.name) : undefined}
                canManageOrg={data.canManageOrg}
                onTogglePublish={data.canManageOrg ? () => togglePublish(c.id, c.isPublished) : undefined}
                onSetOrgDefault={
                  data.canManageOrg && c.isPublished ? () => setOrgDefault(c.id, c.name) : undefined
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function swatchesForBuiltin(key: string): string[] {
  const t = resolveTheme(key as ThemeKey);
  return [t.primary, t.accent, t.bg, t.text, t.chartTertiary];
}

function ThemeRow({
  name,
  swatches,
  active,
  isOrgDefault,
  published,
  mine,
  pending,
  onApply,
  onDuplicate,
  onEdit,
  onDelete,
  canManageOrg,
  onTogglePublish,
  onSetOrgDefault,
}: {
  name: string;
  swatches: string[];
  active: boolean;
  isOrgDefault: boolean;
  published?: boolean;
  mine?: boolean;
  pending: boolean;
  onApply: () => void;
  onDuplicate: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  canManageOrg: boolean;
  onTogglePublish?: () => void;
  onSetOrgDefault?: () => void;
}) {
  return (
    <Card
      className={cn(
        "flex items-center gap-3 p-3 shadow-sm",
        active ? "border-brand-gold ring-brand-gold/20 ring-2" : ""
      )}
    >
      <div className="flex shrink-0 items-center gap-0.5">
        {swatches.map((c, i) => (
          <span key={i} className="h-5 w-3 rounded-sm ring-1 ring-black/10" style={{ background: c }} title={c} />
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-brand-charcoal truncate text-sm font-medium">{name}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          {active && <Badge tone="gold"><Check className="h-2.5 w-2.5" /> Active</Badge>}
          {isOrgDefault && <Badge><Building2 className="h-2.5 w-2.5" /> Company default</Badge>}
          {published && <Badge>Published</Badge>}
          {mine === false && !published && <Badge>Shared</Badge>}
          {mine && <Badge>Mine</Badge>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!active && (
          <Button type="button" size="xs" variant="outline" onClick={onApply} disabled={pending}>
            Apply
          </Button>
        )}
        <IconBtn label="Duplicate" onClick={onDuplicate} disabled={pending}><Copy className="h-3.5 w-3.5" /></IconBtn>
        {onEdit && <IconBtn label="Edit" onClick={onEdit} disabled={pending}><Pencil className="h-3.5 w-3.5" /></IconBtn>}
        {onDelete && <IconBtn label="Delete" onClick={onDelete} disabled={pending}><Trash2 className="h-3.5 w-3.5" /></IconBtn>}
        {canManageOrg && onTogglePublish && (
          <Button type="button" size="xs" variant="ghost" onClick={onTogglePublish} disabled={pending} className="text-[10px]">
            {published ? "Unpublish" : "Publish"}
          </Button>
        )}
        {canManageOrg && onSetOrgDefault && !isOrgDefault && (
          <IconBtn label="Set as company default" onClick={onSetOrgDefault} disabled={pending}>
            <Building2 className="h-3.5 w-3.5" />
          </IconBtn>
        )}
      </div>
    </Card>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: "gold" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide",
        tone === "gold"
          ? "bg-brand-gold text-brand-navy"
          : "text-muted-foreground border border-[var(--border)]"
      )}
    >
      {children}
    </span>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="text-muted-foreground hover:text-brand-charcoal rounded p-1 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

// ─── Editor ──────────────────────────────────────────────────────────────────

function ThemeEditor({
  id,
  initialName,
  initialTokens,
  onClose,
  onSaved,
}: {
  id: string;
  initialName: string;
  initialTokens: ThemeTokens;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { preview, endPreview, setTheme } = useTheme();
  const [name, setName] = useState(initialName);
  const [draft, setDraft] = useState<ThemeTokens>(initialTokens);
  const [pending, startTransition] = useTransition();

  // Live preview whenever the draft changes; restore on unmount.
  useEffect(() => {
    preview(resolvedFrom(id, name, draft));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, name]);
  useEffect(() => {
    return () => endPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const contrast = checkContrast(draft.text, draft.bg);
  const validation = validateThemeTokens(draft);

  const setColor = (key: keyof ThemeTokens, v: string) =>
    setDraft((d) => ({ ...d, [key]: v.toUpperCase() }));
  const setChart = (i: number, v: string) =>
    setDraft((d) => {
      const charts = [...d.charts] as [string, string, string, string, string];
      charts[i] = v.toUpperCase();
      return { ...d, charts };
    });
  const setFont = (slot: keyof ThemeTokens["fonts"], v: string) =>
    setDraft((d) => ({ ...d, fonts: { ...d.fonts, [slot]: v } }));

  const save = () => {
    if (!validation.ok) {
      toast.error(validation.error);
      return;
    }
    startTransition(async () => {
      const res = await updateCustomThemeAction(id, { name, tokens: draft });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // Commit the saved theme as the applied one (ends the preview state).
      setTheme(id, resolvedFrom(id, name, draft));
      toast.success("Theme saved");
      onSaved();
    });
  };

  return (
    <Card className="border-brand-gold/40 space-y-4 p-4 shadow-md">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1">
          <Label htmlFor="theme-name" className="text-[11px]">Theme name</Label>
          <Input
            id="theme-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 h-8 max-w-xs text-sm"
          />
        </div>
        <button type="button" onClick={onClose} aria-label="Close editor" className="text-muted-foreground hover:text-brand-charcoal">
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="text-muted-foreground text-[11px]">
        Editing previews live across the whole app. Changes aren&apos;t saved until you press Save;
        closing discards them.
      </p>

      {/* Contrast state */}
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium",
          contrast.passes ? "bg-[color-mix(in_oklab,var(--brand-status-green)_15%,transparent)] text-[var(--brand-status-green)]" : "bg-[color-mix(in_oklab,var(--destructive)_12%,transparent)] text-destructive"
        )}
      >
        Text / background contrast {contrast.ratio.toFixed(2)}:1 —{" "}
        {contrast.passes ? "passes WCAG AA" : "fails WCAG AA (need 4.5:1, can't save)"}
      </div>

      {/* Colour tokens */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {THEME_COLOR_TOKEN_KEYS.map((key) => (
          <div key={key} className="flex items-center justify-between gap-2">
            <span className="text-brand-charcoal text-[11px]">{COLOR_LABELS[key]}</span>
            <ColorInput
              value={draft[key]}
              onChange={(v) => setColor(key, v)}
              ariaLabel={COLOR_LABELS[key]}
            />
          </div>
        ))}
      </div>

      {/* Chart palette */}
      <div>
        <p className="text-muted-foreground mb-1.5 text-[11px] font-semibold uppercase tracking-wide">
          Chart palette (5 stops)
        </p>
        <div className="flex flex-wrap gap-2">
          {draft.charts.map((c, i) => (
            <ColorInput key={i} value={c} onChange={(v) => setChart(i, v)} ariaLabel={`Chart stop ${i + 1}`} />
          ))}
        </div>
      </div>

      {/* Fonts */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {(["sans", "serif", "mono"] as const).map((slot) => (
          <div key={slot}>
            <Label className="text-[11px] capitalize">{slot}</Label>
            <Select value={draft.fonts[slot]} onValueChange={(v) => v && setFont(slot, v)}>
              <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FONT_VALUES.map((f) => (
                  <SelectItem key={f} value={f}>{FONT_LABELS[f]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-3">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={pending || !validation.ok}
          className="bg-brand-gold text-brand-navy hover:bg-brand-gold/90"
        >
          {pending ? "Saving…" : "Save theme"}
        </Button>
      </div>
    </Card>
  );
}
