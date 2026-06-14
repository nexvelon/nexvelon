"use client";

// SCOPE-1 — inline editor for a "Scope of Work" schedule's sub-sections.
// Mirrors AssuranceCardEditor: a reorderable list of { subtitle, body } rows.
// The section title itself is edited via the standard per-schedule title input
// in SchedulesCard (same as every other kind).

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { newId } from "@/lib/quote-helpers";
import type { ScopeSubSection } from "@/lib/quote-schedules";

interface Props {
  sections: ScopeSubSection[];
  onChange: (next: ScopeSubSection[]) => void;
  disabled?: boolean;
}

function newSubSection(): ScopeSubSection {
  return { id: newId("scope"), subtitle: "", body: "" };
}

export function ScopeEditor({ sections, onChange, disabled }: Props) {
  const patchAt = (idx: number, patch: Partial<ScopeSubSection>) => {
    onChange(sections.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const move = (idx: number, dir: "up" | "down") => {
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };

  const remove = (idx: number) => {
    onChange(sections.filter((_, i) => i !== idx));
  };

  const append = () => onChange([...sections, newSubSection()]);

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-[11px]">
        Sub-sections render in order on the Scope of Work page — e.g. Inclusions,
        Exclusions, Theory of Operations. Body line breaks are preserved.
      </p>

      <div className="space-y-2">
        {sections.map((section, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === sections.length - 1;
          return (
            <div
              key={section.id}
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
                    aria-label="Move sub-section up"
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
                    aria-label="Move sub-section down"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                </div>

                <Input
                  value={section.subtitle}
                  onChange={(e) => patchAt(idx, { subtitle: e.target.value })}
                  disabled={disabled}
                  placeholder="Inclusions"
                  className="h-7 flex-1 text-sm font-medium"
                  aria-label="Sub-section subtitle"
                />

                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive h-7 w-7 p-0"
                  disabled={disabled}
                  onClick={() => remove(idx)}
                  aria-label="Delete sub-section"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <Textarea
                value={section.body}
                onChange={(e) => patchAt(idx, { body: e.target.value })}
                disabled={disabled}
                rows={4}
                placeholder={"One item per line…\n• Supply & install …\n• Commissioning …"}
                className="text-xs"
                aria-label="Sub-section body"
              />
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
        Add sub-section
      </Button>
    </div>
  );
}
