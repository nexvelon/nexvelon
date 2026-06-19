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
} from "@/app/(app)/settings/company-settings-actions";

type TierLevel = "bronze" | "silver" | "gold" | "platinum";

const TIERS: ReadonlyArray<{ level: TierLevel; title: string }> = [
  { level: "bronze", title: "Bronze" },
  { level: "silver", title: "Silver" },
  { level: "gold", title: "Gold" },
  { level: "platinum", title: "Platinum" },
];

export function ClientTiersPane() {
  const { role } = useRole();
  const [texts, setTexts] = useState<Record<TierLevel, string>>({
    bronze: "",
    silver: "",
    gold: "",
    platinum: "",
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (role !== "Admin") return;
    let active = true;
    getTierTextsAction()
      .then((res) => {
        if (active && res.ok) setTexts(res.data);
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
    </div>
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
      <p className="text-muted-foreground mb-3 text-[11px]">
        Shown to clients placed in the {title} prestige tier.
      </p>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
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
