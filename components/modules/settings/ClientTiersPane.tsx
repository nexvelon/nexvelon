"use client";

// POLISH-5 — Settings pane for the four Prestige Tier description blocks
// (Bronze / Silver / Gold / Platinum). The text is surfaced in the client
// invite + approval/decline outcome emails. Mirrors the DefaultTermsEditor
// pattern in SettingsPanes.tsx: loads stored values on mount, saves per-block
// via the requireAdmin-gated action. Hidden for non-Admins (the action
// enforces the server gate too).

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useRole } from "@/lib/role-context";
import {
  getTierTextsAction,
  setTierTextAction,
  getTierDisclaimerAction,
  setTierDisclaimerAction,
} from "@/app/(app)/settings/company-settings-actions";
// Type-only import (erased at build) — the company-settings module is
// "server-only" and must not be a runtime dependency of this client component.
import type { TierLevel } from "@/lib/api/company-settings";

// Highest first: Diamond → Platinum → Gold → Silver → Bronze. Kept local so the
// client bundle never pulls the server-only company-settings module.
const TIER_LEVELS_ORDERED: TierLevel[] = [
  "diamond",
  "platinum",
  "gold",
  "silver",
  "bronze",
];

const TIERS: ReadonlyArray<{ level: TierLevel; title: string }> =
  TIER_LEVELS_ORDERED.map((level) => ({
    level,
    title: level.charAt(0).toUpperCase() + level.slice(1),
  }));

const EMPTY_TEXTS = Object.fromEntries(
  TIER_LEVELS_ORDERED.map((l) => [l, ""])
) as Record<TierLevel, string>;

export function ClientTiersPane() {
  const { role } = useRole();
  const [texts, setTexts] = useState<Record<TierLevel, string>>(EMPTY_TEXTS);
  const [disclaimer, setDisclaimer] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (role !== "Admin") return;
    let active = true;
    Promise.all([getTierTextsAction(), getTierDisclaimerAction()])
      .then(([t, d]) => {
        if (!active) return;
        if (t.ok) setTexts(t.data);
        if (d.ok) setDisclaimer(d.data);
      })
      .catch(() => {
        // keep the empty seed already in state
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [role]);

  if (role !== "Admin") return null;

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-[11px] leading-relaxed">
        These descriptions appear in the client invitation email and the
        approval / decline outcome emails. Editing a tier here does not change
        emails already sent.
      </p>
      {TIERS.map((t) => (
        <TierBlock
          key={t.level}
          level={t.level}
          title={t.title}
          value={texts[t.level]}
          onChange={(v) => setTexts((prev) => ({ ...prev, [t.level]: v }))}
          loading={loading}
        />
      ))}
      <DisclaimerBlock
        value={disclaimer}
        onChange={setDisclaimer}
        loading={loading}
      />
    </div>
  );
}

// POLISH-7 (CHANGE 5) — the Nexvelon-discretion disclaimer block.
function DisclaimerBlock({
  value,
  onChange,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  loading: boolean;
}) {
  const [pending, startSave] = useTransition();
  const handleSave = () => {
    startSave(async () => {
      const res = await setTierDisclaimerAction(value);
      if (res.ok) toast.success("Tier assignment disclaimer saved");
      else toast.error(res.error);
    });
  };
  return (
    <Card className="bg-card p-6 shadow-sm">
      <h4 className="text-brand-navy font-serif text-base">
        Tier Assignment Disclaimer
      </h4>
      <p className="text-muted-foreground mb-3 text-[11px]">
        Shown beneath the tier list in the invite email + the client form&apos;s
        tier opt-in (the Nexvelon-discretion fine print).
      </p>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        disabled={loading || pending}
        className="text-xs leading-relaxed"
      />
      <div className="mt-3 flex justify-end">
        <Button onClick={handleSave} disabled={loading || pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Card>
  );
}

function TierBlock({
  level,
  title,
  value,
  onChange,
  loading,
}: {
  level: TierLevel;
  title: string;
  value: string;
  onChange: (v: string) => void;
  loading: boolean;
}) {
  const [pending, startSave] = useTransition();

  const handleSave = () => {
    startSave(async () => {
      const res = await setTierTextAction(level, value);
      if (res.ok) toast.success(`${title} tier saved`);
      else toast.error(res.error);
    });
  };

  return (
    <Card className="bg-card p-6 shadow-sm">
      <h4 className="text-brand-navy font-serif text-base">{title}</h4>
      <p className="text-muted-foreground mb-1 text-[11px]">
        Shown to clients placed in the {title} prestige tier.
      </p>
      {/* CHANGE 7 — format helper for the new bullet-card layout. */}
      <p className="mb-3 text-[11px] italic" style={{ color: "#b8902c" }}>
        First line is the tier headline. Lines starting with &quot;- &quot;
        (dash + space) appear as bullet points. Other lines render as paragraph
        text.
      </p>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={7}
        disabled={loading || pending}
        className="text-xs leading-relaxed"
      />
      <div className="mt-3 flex justify-end">
        <Button onClick={handleSave} disabled={loading || pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Card>
  );
}
