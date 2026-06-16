"use client";

// SCOPE-1 — inline editor for a "Scope of Work" schedule's sub-sections.
// QUOTE-FIX (Batch A): each sub-section's SUBTITLE and BODY are full rich text,
// edited with the SAME RichTextEditor custom sections use (font tiers, sizes,
// headings, bullet-symbol picker) and rendered in the PDF via the same
// renderRichTextBlock path. Legacy plain-string subtitle/body are parsed
// forward by RichTextEditor (parseRichTextBody) — no data loss, no migration.

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { newId } from "@/lib/quote-helpers";
import type { ScopeSubSection } from "@/lib/quote-schedules";
import { RichTextEditor } from "./RichTextEditor";

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
        Exclusions, Theory of Operations. Subtitle and body both support headings,
        lists, bold/italic, and the bullet-symbol picker, like a custom section.
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
              <div className="flex items-center gap-1.5">
                <div className="flex gap-0.5">
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
                <span className="text-muted-foreground text-[11px] font-medium">
                  Sub-section {idx + 1}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive ml-auto h-7 w-7 p-0"
                  disabled={disabled}
                  onClick={() => remove(idx)}
                  aria-label="Delete sub-section"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Subtitle</Label>
                <RichTextEditor
                  value={section.subtitle}
                  onChange={(next) => patchAt(idx, { subtitle: next })}
                  disabled={disabled}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Body</Label>
                <RichTextEditor
                  value={section.body}
                  onChange={(next) => patchAt(idx, { body: next })}
                  disabled={disabled}
                />
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
        Add sub-section
      </Button>
    </div>
  );
}
