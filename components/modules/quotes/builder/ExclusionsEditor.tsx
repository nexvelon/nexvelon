"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { newId } from "@/lib/quote-helpers";
import type { ExclusionItem } from "@/lib/quote-schedules";

interface Props {
  exclusions: ExclusionItem[];
  onChange: (next: ExclusionItem[]) => void;
  disabled?: boolean;
}

function newExclusion(): ExclusionItem {
  return { id: newId("exc"), text: "New exclusion" };
}

export function ExclusionsEditor({ exclusions, onChange, disabled }: Props) {
  const patchAt = (idx: number, patch: Partial<ExclusionItem>) => {
    onChange(exclusions.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  };

  const move = (idx: number, dir: "up" | "down") => {
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= exclusions.length) return;
    const next = [...exclusions];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };

  const remove = (idx: number) => {
    onChange(exclusions.filter((_, i) => i !== idx));
  };

  const append = () => onChange([...exclusions, newExclusion()]);

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-[11px]">
        Not included in this quotation. Renders as the &ldquo;Pray Observe&rdquo;
        block at the top of the Agreement page.
      </p>

      <div className="space-y-1.5">
        {exclusions.map((ex, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === exclusions.length - 1;
          return (
            <div
              key={ex.id}
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
                  aria-label="Move exclusion up"
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
                  aria-label="Move exclusion down"
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
              </div>

              <Input
                value={ex.text}
                onChange={(e) => patchAt(idx, { text: e.target.value })}
                disabled={disabled}
                placeholder="e.g. Conduit, cable trays, and core drilling"
                className="h-7 flex-1 text-sm"
                aria-label="Exclusion text"
              />

              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive h-7 w-7 p-0"
                disabled={disabled}
                onClick={() => remove(idx)}
                aria-label="Delete exclusion"
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
        Add exclusion
      </Button>
    </div>
  );
}
