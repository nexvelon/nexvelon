"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  Camera,
  Check,
  CircleDot,
  FileSignature,
  ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  buildCommissioningChecklist,
  type ChecklistSection,
  type CommissioningItem,
} from "@/lib/project-data";
import { TODAY } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
  readOnly?: boolean;
}

const SECTION_ORDER: ChecklistSection[] = [
  "Access Control",
  "CCTV",
  "Intrusion",
  "Intercom",
  "Fire Monitoring",
  "General Closeout",
];

export function CommissioningTab({ project, readOnly }: Props) {
  const seed = useMemo(() => buildCommissioningChecklist(project), [project]);
  const [items, setItems] = useState<CommissioningItem[]>(seed);

  const sectionsPresent = SECTION_ORDER.filter((s) =>
    items.some((it) => it.section === s)
  );

  const total = items.length;
  const done = items.filter((it) => it.done).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  const update = (id: string, patch: Partial<CommissioningItem>) => {
    if (readOnly) return;
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const toggle = (id: string) => {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    update(id, {
      done: !it.done,
      completedAt: !it.done ? TODAY.toISOString().slice(0, 10) : undefined,
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div>
            <h2 className="text-brand-navy font-serif text-2xl tabular-nums">
              {pct}%
              <span className="text-base font-normal"> commissioned</span>
            </h2>
            <p className="text-muted-foreground text-xs">
              {done} of {total} items signed off across {sectionsPresent.length} sections.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-muted h-2 w-48 overflow-hidden rounded-full">
              <div
                className="bg-brand-gold h-full"
                style={{ width: `${pct}%`, transition: "width 0.4s ease" }}
              />
            </div>
            <Button
              type="button"
              size="sm"
              className="bg-brand-navy hover:bg-brand-navy/90 text-white"
              onClick={() =>
                toast.success("Commissioning report generated", {
                  description:
                    "PDF export queued — would download via @react-pdf/renderer in production.",
                })
              }
            >
              <FileSignature className="mr-1 h-3.5 w-3.5" />
              Generate Report
            </Button>
          </div>
        </CardContent>
      </Card>

      {sectionsPresent.map((section) => {
        const inSection = items.filter((it) => it.section === section);
        const sDone = inSection.filter((it) => it.done).length;
        const sPct = inSection.length === 0 ? 0 : Math.round((sDone / inSection.length) * 100);

        return (
          <Card key={section}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="font-serif text-lg">
                  {section} Commissioning
                </CardTitle>
                <div className="flex items-center gap-3 text-xs">
                  <div className="bg-muted h-1.5 w-32 overflow-hidden rounded-full">
                    <div
                      className="bg-brand-gold h-full"
                      style={{ width: `${sPct}%` }}
                    />
                  </div>
                  <span className="text-muted-foreground tabular-nums">
                    {sDone}/{inSection.length}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-0">
              <ul className="divide-y divide-[var(--border)]">
                {inSection.map((it) => (
                  <ChecklistRow
                    key={it.id}
                    item={it}
                    readOnly={readOnly}
                    onToggle={() => toggle(it.id)}
                    onChange={(patch) => update(it.id, patch)}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ChecklistRow({
  item,
  readOnly,
  onToggle,
  onChange,
}: {
  item: CommissioningItem;
  readOnly?: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<CommissioningItem>) => void;
}) {
  return (
    <li className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-[28px_1fr_auto] sm:items-start">
      <button
        type="button"
        onClick={onToggle}
        disabled={readOnly}
        className={cn(
          "mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-md border transition-colors",
          item.done
            ? "bg-brand-gold border-brand-gold text-brand-navy"
            : "border-brand-navy/20 hover:border-brand-gold"
        )}
        aria-label={item.done ? "Mark incomplete" : "Mark complete"}
      >
        {item.done ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <CircleDot className="text-muted-foreground/40 h-3 w-3" />
        )}
      </button>

      <div>
        <p
          className={cn(
            "text-sm leading-snug",
            item.done ? "text-muted-foreground" : "text-brand-charcoal font-medium"
          )}
        >
          {item.description}
        </p>
        <Textarea
          rows={1}
          value={item.notes ?? ""}
          onChange={(e) => onChange({ notes: e.target.value })}
          disabled={readOnly}
          placeholder="Notes (witnesses, deviations, exceptions)…"
          className="mt-2 min-h-[28px] resize-y text-xs"
        />
        {item.completedAt && (
          <p className="text-muted-foreground mt-1 text-[11px]">
            Signed off {format(parseISO(item.completedAt), "MMM d, yyyy")} by{" "}
            <span className="text-brand-navy font-semibold">
              {item.techInitials ?? "—"}
            </span>
          </p>
        )}
      </div>

      <div className="flex flex-col items-end gap-2 sm:min-w-[140px]">
        <Input
          value={item.techInitials ?? ""}
          onChange={(e) =>
            onChange({ techInitials: e.target.value.toUpperCase().slice(0, 3) })
          }
          disabled={readOnly}
          placeholder="Initials"
          className="h-7 w-20 text-center text-xs uppercase"
          aria-label="Technician initials"
        />
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={readOnly}
          onClick={() => onChange({ hasPhoto: true })}
          className="text-[10px]"
        >
          {item.hasPhoto ? (
            <>
              <ImageIcon className="text-brand-gold mr-1 h-3 w-3" />
              Photo attached
            </>
          ) : (
            <>
              <Camera className="mr-1 h-3 w-3" />
              Add photo
            </>
          )}
        </Button>
      </div>
    </li>
  );
}
