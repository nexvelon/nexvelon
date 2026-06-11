"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { newId } from "@/lib/quote-helpers";
import type {
  Keyholder,
  KeyholdersScheduleInstance,
} from "@/lib/quote-schedules";

// GF-3 — editor for a Guardian "keyholders" schedule. Mirrors the
// MonitoringEditor pattern: local helpers mutate the array / fields and emit a
// partial via onChange, which SchedulesCard writes back with patchAt. Captures
// keyholder contacts only — NEVER payment or card data.
interface Props {
  keyholders: Keyholder[];
  burglar?: string;
  fire?: string;
  duress?: string;
  medical?: string;
  note?: string;
  onChange: (patch: Partial<KeyholdersScheduleInstance>) => void;
  disabled?: boolean;
}

function newKeyholder(): Keyholder {
  return {
    id: newId("kh"),
    name: "",
    priority: "",
    homePhone: "",
    mobilePhone: "",
    businessPhone: "",
    passcard: "",
    authorizedToChange: false,
  };
}

const SEQUENCES: {
  key: "burglar" | "fire" | "duress" | "medical";
  label: string;
}[] = [
  { key: "burglar", label: "Burglar" },
  { key: "fire", label: "Fire" },
  { key: "duress", label: "Duress" },
  { key: "medical", label: "Medical" },
];

export function KeyholdersEditor({
  keyholders,
  burglar,
  fire,
  duress,
  medical,
  note,
  onChange,
  disabled,
}: Props) {
  const seqValues = { burglar, fire, duress, medical };

  const patchKeyholder = (idx: number, patch: Partial<Keyholder>) => {
    onChange({
      keyholders: keyholders.map((k, i) =>
        i === idx ? { ...k, ...patch } : k
      ),
    });
  };

  const move = (idx: number, dir: "up" | "down") => {
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= keyholders.length) return;
    const next = [...keyholders];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange({ keyholders: next });
  };

  const remove = (idx: number) => {
    onChange({ keyholders: keyholders.filter((_, i) => i !== idx) });
  };

  const append = () => onChange({ keyholders: [...keyholders, newKeyholder()] });

  return (
    <div className="space-y-3 pt-1">
      <p className="text-muted-foreground text-[11px]">
        Authorized keyholders / pass-card holders. The PDF renders blank ruled
        rows when this list is empty so the client can complete it by hand.
      </p>

      <div className="space-y-2">
        {keyholders.map((k, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === keyholders.length - 1;
          return (
            <div
              key={k.id}
              className="bg-background space-y-1.5 rounded-md border border-[var(--border)] p-2"
            >
              <div className="flex items-start gap-1.5">
                <div className="flex flex-col gap-0.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    disabled={disabled || isFirst}
                    onClick={() => move(idx, "up")}
                    aria-label="Move keyholder up"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    disabled={disabled || isLast}
                    onClick={() => move(idx, "down")}
                    aria-label="Move keyholder down"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                </div>

                <Input
                  value={k.name}
                  onChange={(e) => patchKeyholder(idx, { name: e.target.value })}
                  disabled={disabled}
                  placeholder="Name"
                  className="h-7 flex-1 text-sm"
                  aria-label="Keyholder name"
                />
                <Input
                  value={k.priority ?? ""}
                  onChange={(e) =>
                    patchKeyholder(idx, { priority: e.target.value })
                  }
                  disabled={disabled}
                  placeholder="Priority"
                  className="h-7 w-20 text-xs"
                  aria-label="Priority"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive h-7 w-7 p-0"
                  disabled={disabled}
                  onClick={() => remove(idx)}
                  aria-label="Delete keyholder"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <Input
                  value={k.homePhone ?? ""}
                  onChange={(e) =>
                    patchKeyholder(idx, { homePhone: e.target.value })
                  }
                  disabled={disabled}
                  placeholder="Home phone"
                  className="h-7 text-xs"
                  aria-label="Home phone"
                />
                <Input
                  value={k.mobilePhone ?? ""}
                  onChange={(e) =>
                    patchKeyholder(idx, { mobilePhone: e.target.value })
                  }
                  disabled={disabled}
                  placeholder="Mobile phone"
                  className="h-7 text-xs"
                  aria-label="Mobile phone"
                />
                <Input
                  value={k.businessPhone ?? ""}
                  onChange={(e) =>
                    patchKeyholder(idx, { businessPhone: e.target.value })
                  }
                  disabled={disabled}
                  placeholder="Business phone"
                  className="h-7 text-xs"
                  aria-label="Business phone"
                />
              </div>

              <div className="flex items-center gap-2">
                <Input
                  value={k.passcard ?? ""}
                  onChange={(e) =>
                    patchKeyholder(idx, { passcard: e.target.value })
                  }
                  disabled={disabled}
                  placeholder="Passcard #"
                  className="h-7 flex-1 text-xs"
                  aria-label="Passcard"
                />
                <Button
                  type="button"
                  size="sm"
                  variant={k.authorizedToChange ? "default" : "outline"}
                  disabled={disabled}
                  onClick={() =>
                    patchKeyholder(idx, {
                      authorizedToChange: !k.authorizedToChange,
                    })
                  }
                  aria-pressed={k.authorizedToChange}
                  className="h-7"
                >
                  Authorized to change:{" "}
                  {k.authorizedToChange ? "Yes" : "No"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={append}
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        Add keyholder
      </Button>

      {/* Response sequences */}
      <div className="space-y-1.5 pt-1">
        <Label className="text-[11px]">Response sequences</Label>
        {SEQUENCES.map((s) => (
          <div key={s.key} className="flex items-center gap-2">
            <span className="text-muted-foreground w-16 text-[11px]">
              {s.label}
            </span>
            <Input
              value={seqValues[s.key] ?? ""}
              onChange={(e) => onChange({ [s.key]: e.target.value })}
              disabled={disabled}
              className="h-7 flex-1 text-xs"
              aria-label={`${s.label} response sequence`}
            />
          </div>
        ))}
      </div>

      {/* Note */}
      <div className="space-y-1">
        <Label className="text-[11px]">Note</Label>
        <Textarea
          value={note ?? ""}
          onChange={(e) => onChange({ note: e.target.value })}
          disabled={disabled}
          rows={3}
          className="text-xs leading-relaxed"
          aria-label="Keyholders note"
        />
      </div>
    </div>
  );
}
