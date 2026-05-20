"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { newId } from "@/lib/quote-helpers";
import type { CalendarPhase } from "@/lib/quote-schedules";

interface Props {
  phases: CalendarPhase[];
  caption: string;
  onPhasesChange: (next: CalendarPhase[]) => void;
  onCaptionChange: (next: string) => void;
  disabled?: boolean;
}

function newPhase(): CalendarPhase {
  return { id: newId("phs"), name: "New phase", startWeek: 1, endWeek: 1 };
}

// Coerce a free-form number input value to a positive integer (>=1).
// Empty / non-numeric inputs collapse to 1 so the Gantt math stays sane.
function clampWeek(raw: string): number {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export function CalendarPhaseEditor({
  phases,
  caption,
  onPhasesChange,
  onCaptionChange,
  disabled,
}: Props) {
  const patchAt = (idx: number, patch: Partial<CalendarPhase>) => {
    const next = phases.map((p, i) => {
      if (i !== idx) return p;
      const merged = { ...p, ...patch };
      // Keep endWeek >= startWeek.
      if (merged.endWeek < merged.startWeek) {
        merged.endWeek = merged.startWeek;
      }
      return merged;
    });
    onPhasesChange(next);
  };

  const move = (idx: number, dir: "up" | "down") => {
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= phases.length) return;
    const next = [...phases];
    [next[idx], next[target]] = [next[target], next[idx]];
    onPhasesChange(next);
  };

  const remove = (idx: number) => {
    onPhasesChange(phases.filter((_, i) => i !== idx));
  };

  const append = () => onPhasesChange([...phases, newPhase()]);

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-[11px]">
        Phases. Each renders as a card on the Calendar page and a bar on the
        Gantt chart.
      </p>

      <div className="space-y-1.5">
        {phases.map((phase, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === phases.length - 1;
          return (
            <div
              key={phase.id}
              className="bg-background flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2 py-1.5"
            >
              <div className="flex flex-col gap-0.5">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-5 w-5 p-0"
                  disabled={disabled || isFirst}
                  onClick={() => move(idx, "up")}
                  aria-label="Move phase up"
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-5 w-5 p-0"
                  disabled={disabled || isLast}
                  onClick={() => move(idx, "down")}
                  aria-label="Move phase down"
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
              </div>

              <Input
                value={phase.name}
                onChange={(e) => patchAt(idx, { name: e.target.value })}
                disabled={disabled}
                placeholder="Survey & Design"
                className="h-7 flex-1 text-sm"
                aria-label="Phase name"
              />

              <Input
                type="number"
                min={1}
                value={phase.startWeek}
                onChange={(e) =>
                  patchAt(idx, { startWeek: clampWeek(e.target.value) })
                }
                disabled={disabled}
                className="h-7 w-14 text-center text-sm"
                aria-label="Start week"
              />
              <span className="text-muted-foreground text-xs">–</span>
              <Input
                type="number"
                min={1}
                value={phase.endWeek}
                onChange={(e) =>
                  patchAt(idx, { endWeek: clampWeek(e.target.value) })
                }
                disabled={disabled}
                className="h-7 w-14 text-center text-sm"
                aria-label="End week"
              />

              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive h-7 w-7 p-0"
                disabled={disabled}
                onClick={() => remove(idx)}
                aria-label="Delete phase"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
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
        Add phase
      </Button>

      <div className="space-y-1 pt-2">
        <Label className="text-[11px]">Caption</Label>
        <Textarea
          value={caption}
          onChange={(e) => onCaptionChange(e.target.value)}
          disabled={disabled}
          rows={3}
          placeholder="Italic note rendered at the bottom of the Calendar page."
          className="text-sm"
        />
        <p className="text-muted-foreground text-[11px]">
          Italic note at the bottom of the Calendar page.
        </p>
      </div>
    </div>
  );
}
