"use client";

import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Plus,
  Trash2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RichTextEditor } from "./RichTextEditor";
import {
  QUOTE_SCHEDULE_DEFINITIONS,
  createCustomSchedule,
  type CoverScheduleInstance,
  type CustomScheduleInstance,
  type QuoteScheduleInstance,
  type QuoteScheduleKind,
} from "@/lib/quote-schedules";
import { newId } from "@/lib/quote-helpers";

interface Props {
  schedules: QuoteScheduleInstance[];
  onChange: (next: QuoteScheduleInstance[]) => void;
  disabled?: boolean;
}

const KIND_BADGE_LABEL: Record<QuoteScheduleKind, string> = {
  cover: "Cover",
  particulars: "Particulars",
  agreement: "Agreement",
  acceptance: "Acceptance",
  custom: "Custom",
};

const ADDABLE_KINDS: QuoteScheduleKind[] = [
  "cover",
  "particulars",
  "agreement",
  "acceptance",
  "custom",
];

function buildScheduleOfKind(kind: QuoteScheduleKind): QuoteScheduleInstance {
  if (kind === "custom") return createCustomSchedule();
  const def = QUOTE_SCHEDULE_DEFINITIONS[kind];
  const base = {
    id: newId("sch"),
    title: def.defaultTitle,
    subtitle: def.defaultSubtitle,
    included: true,
  };
  switch (kind) {
    case "cover":
      return { ...base, kind, scopeOfWorks: "" };
    case "particulars":
      return { ...base, kind };
    case "agreement":
      return { ...base, kind };
    case "acceptance":
      return { ...base, kind };
  }
}

export function SchedulesCard({ schedules, onChange, disabled }: Props) {
  const patchAt = (
    idx: number,
    patch: Partial<QuoteScheduleInstance>
  ) => {
    onChange(
      schedules.map((s, i) =>
        i === idx ? ({ ...s, ...patch } as QuoteScheduleInstance) : s
      )
    );
  };

  const move = (idx: number, dir: "up" | "down") => {
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= schedules.length) return;
    const next = [...schedules];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };

  const remove = (idx: number) => {
    onChange(schedules.filter((_, i) => i !== idx));
  };

  const append = (kind: QuoteScheduleKind) => {
    onChange([...schedules, buildScheduleOfKind(kind)]);
  };

  const kindAlreadyExists = (kind: QuoteScheduleKind): boolean =>
    schedules.some((s) => s.kind === kind);

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-brand-navy font-serif text-lg">
          Schedules
        </CardTitle>
        <p className="text-muted-foreground text-xs">
          Pages of the quote PDF, in render order.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {schedules.map((schedule, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === schedules.length - 1;
          return (
            <div
              key={schedule.id}
              className="bg-card space-y-2 rounded-md border border-[var(--border)] p-3"
            >
              <div className="flex items-start gap-2">
                <div className="flex flex-col gap-0.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    disabled={disabled || isFirst}
                    onClick={() => move(idx, "up")}
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    disabled={disabled || isLast}
                    onClick={() => move(idx, "down")}
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                      {KIND_BADGE_LABEL[schedule.kind]}
                    </span>
                    <Input
                      value={schedule.title}
                      onChange={(e) =>
                        patchAt(idx, { title: e.target.value })
                      }
                      disabled={disabled}
                      placeholder="Title"
                      className="h-8 text-sm"
                    />
                  </div>
                  <Input
                    value={schedule.subtitle}
                    onChange={(e) =>
                      patchAt(idx, { subtitle: e.target.value })
                    }
                    disabled={disabled}
                    placeholder="Subtitle"
                    className="text-muted-foreground h-7 text-xs"
                  />
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    disabled={disabled}
                    onClick={() =>
                      patchAt(idx, { included: !schedule.included })
                    }
                    aria-label={
                      schedule.included
                        ? "Hide from PDF"
                        : "Include in PDF"
                    }
                    title={
                      schedule.included
                        ? "Included in PDF"
                        : "Hidden from PDF"
                    }
                  >
                    {schedule.included ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="text-muted-foreground h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive h-7 w-7 p-0"
                    disabled={disabled}
                    onClick={() => remove(idx)}
                    aria-label="Delete schedule"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {schedule.kind === "cover" && (
                <div className="space-y-1 pt-1">
                  <Label className="text-[11px]">Scope of Works</Label>
                  <Textarea
                    value={(schedule as CoverScheduleInstance).scopeOfWorks}
                    onChange={(e) =>
                      patchAt(idx, {
                        scopeOfWorks: e.target.value,
                      } as Partial<CoverScheduleInstance>)
                    }
                    disabled={disabled}
                    rows={4}
                    placeholder="Optional paragraph rendered with a drop-cap on the cover page."
                    className="text-sm"
                  />
                  <p className="text-muted-foreground text-[11px]">
                    Drop-cap paragraph on the cover page. Leave empty to hide.
                  </p>
                </div>
              )}

              {schedule.kind === "custom" && (
                <div className="space-y-1 pt-1">
                  <Label className="text-[11px]">Body</Label>
                  <RichTextEditor
                    value={(schedule as CustomScheduleInstance).body}
                    onChange={(next) =>
                      patchAt(idx, {
                        body: next,
                      } as Partial<CustomScheduleInstance>)
                    }
                    disabled={disabled}
                  />
                  <p className="text-muted-foreground text-[11px]">
                    Use headings, lists, bold, and italic for structure.
                    Renders into the PDF with the chosen theme.
                  </p>
                </div>
              )}
            </div>
          );
        })}

        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={disabled}
            className="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add schedule</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {ADDABLE_KINDS.map((kind) => {
              const def = QUOTE_SCHEDULE_DEFINITIONS[kind];
              const single = !def.allowMultiple && kindAlreadyExists(kind);
              return (
                <DropdownMenuItem
                  key={kind}
                  disabled={single}
                  onClick={() => append(kind)}
                  className="flex flex-col items-start gap-0.5"
                >
                  <span className="text-sm">{KIND_BADGE_LABEL[kind]}</span>
                  <span className="text-muted-foreground text-[11px]">
                    {single ? "Already added" : def.description}
                  </span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </CardContent>
    </Card>
  );
}
