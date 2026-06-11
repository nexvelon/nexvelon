"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PadScheduleInstance } from "@/lib/quote-schedules";

// GF-4 — editor for a Guardian "pad" schedule. Authorization prose + notice
// days + collection note only. DELIBERATELY no bank/card/account/CVV inputs —
// account details are collected on a separate secure form.
interface Props {
  authorizationText?: string;
  noticeDays?: number;
  collectionNote?: string;
  onChange: (patch: Partial<PadScheduleInstance>) => void;
  disabled?: boolean;
}

export function PadEditor({
  authorizationText,
  noticeDays,
  collectionNote,
  onChange,
  disabled,
}: Props) {
  return (
    <div className="space-y-3 pt-1">
      <div className="space-y-1">
        <Label className="text-[11px]">Authorization text</Label>
        <Textarea
          value={authorizationText ?? ""}
          onChange={(e) => onChange({ authorizationText: e.target.value })}
          disabled={disabled}
          rows={6}
          className="text-xs leading-relaxed"
          aria-label="Authorization text"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-[11px]">Notice days</Label>
        <Input
          type="number"
          min={0}
          step="1"
          inputMode="numeric"
          value={Number.isFinite(noticeDays ?? 30) ? (noticeDays ?? 30) : 30}
          onChange={(e) =>
            onChange({
              noticeDays: Math.max(0, Number.parseInt(e.target.value, 10) || 0),
            })
          }
          disabled={disabled}
          className="h-7 w-24 text-right text-xs"
          aria-label="Notice days"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-[11px]">Collection note</Label>
        <Textarea
          value={collectionNote ?? ""}
          onChange={(e) => onChange({ collectionNote: e.target.value })}
          disabled={disabled}
          rows={3}
          className="text-xs leading-relaxed"
          aria-label="Collection note"
        />
      </div>

      <p className="text-muted-foreground text-[11px]">
        Bank-account and credit-card details are never entered or stored here —
        they are collected on Nexvelon&apos;s separate secure authorization form.
      </p>
    </div>
  );
}
