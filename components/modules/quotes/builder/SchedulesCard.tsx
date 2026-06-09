"use client";

import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
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
  createAssuranceSchedule,
  createCustomSchedule,
  createDrawingsSchedule,
  createMonitoringSchedule,
  type AssuranceCard,
  type AssuranceScheduleInstance,
  type CoverScheduleInstance,
  type CustomScheduleInstance,
  type DrawingsScheduleInstance,
  type MonitoringScheduleInstance,
  type QuoteScheduleInstance,
  type QuoteScheduleKind,
} from "@/lib/quote-schedules";
import { newId } from "@/lib/quote-helpers";
import { deleteDrawingsPdf, uploadDrawingsPdf } from "@/lib/api/drawings";
import { AssuranceCardEditor } from "./AssuranceCardEditor";
import { MonitoringEditor } from "./MonitoringEditor";
import { useRole } from "@/lib/role-context";

interface Props {
  schedules: QuoteScheduleInstance[];
  onChange: (next: QuoteScheduleInstance[]) => void;
  disabled?: boolean;
  /** GF-1: the "monitoring" add-option is offered only for Guardian quotes. */
  isGuardian?: boolean;
}

const KIND_BADGE_LABEL: Record<QuoteScheduleKind, string> = {
  cover: "Cover",
  particulars: "Particulars",
  drawings: "Drawings & Take-off",
  assurance: "Assurance",
  agreement: "Agreement",
  acceptance: "Acceptance",
  custom: "Custom",
  monitoring: "Monitoring Services",
};

const ADDABLE_KINDS: QuoteScheduleKind[] = [
  "cover",
  "particulars",
  "assurance",
  "monitoring",
  "drawings",
  "agreement",
  "acceptance",
  "custom",
];

function buildScheduleOfKind(kind: QuoteScheduleKind): QuoteScheduleInstance {
  if (kind === "custom") return createCustomSchedule();
  if (kind === "assurance") return createAssuranceSchedule();
  if (kind === "monitoring") return createMonitoringSchedule();
  if (kind === "drawings") return createDrawingsSchedule();
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function SchedulesCard({
  schedules,
  onChange,
  disabled,
  isGuardian = false,
}: Props) {
  // Chunk 3b: the Agreement (Terms) + Acceptance schedules can only be deleted
  // by an Admin — the remove control is hidden for other roles on those two
  // kinds. Include-toggle, reorder, and all other kinds' deletion are unchanged.
  const { role } = useRole();
  const isAdmin = role === "Admin";
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  // Hidden <input type=file> refs, keyed by stable schedule id (survives reorder).
  const fileInputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map());

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

  async function handleUpload(idx: number, file?: File) {
    if (!file) return;
    setUploadingIdx(idx);
    try {
      const uploaded = await uploadDrawingsPdf(file);
      patchAt(idx, {
        pdfPath: uploaded.path,
        pdfFilename: uploaded.filename,
        pdfSize: uploaded.size,
        pdfUploadedAt: uploaded.uploadedAt,
      } as Partial<DrawingsScheduleInstance>);
      toast.success("Drawings PDF uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingIdx(null);
    }
  }

  async function handleRemove(idx: number, path: string) {
    try {
      await deleteDrawingsPdf(path);
      patchAt(idx, {
        pdfPath: undefined,
        pdfFilename: undefined,
        pdfSize: undefined,
        pdfUploadedAt: undefined,
      } as Partial<DrawingsScheduleInstance>);
      toast.success("Drawings PDF removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Remove failed");
    }
  }

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
                  {/* Agreement (Terms) + Acceptance are delete-protected:
                      only an Admin sees the remove control on those two kinds. */}
                  {(isAdmin ||
                    (schedule.kind !== "agreement" &&
                      schedule.kind !== "acceptance")) && (
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
                  )}
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

              {schedule.kind === "assurance" && (
                <div className="space-y-1 pt-1">
                  <AssuranceCardEditor
                    cards={(schedule as AssuranceScheduleInstance).cards}
                    onChange={(next: AssuranceCard[]) =>
                      patchAt(idx, {
                        cards: next,
                      } as Partial<AssuranceScheduleInstance>)
                    }
                    disabled={disabled}
                  />
                </div>
              )}

              {schedule.kind === "monitoring" && (
                <div className="space-y-1 pt-1">
                  <MonitoringEditor
                    services={(schedule as MonitoringScheduleInstance).services}
                    setupLabel={
                      (schedule as MonitoringScheduleInstance).setupLabel
                    }
                    setupAmount={
                      (schedule as MonitoringScheduleInstance).setupAmount
                    }
                    onChange={(patch) =>
                      patchAt(idx, patch as Partial<QuoteScheduleInstance>)
                    }
                    disabled={disabled}
                  />
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

              {schedule.kind === "drawings" && (
                <div className="space-y-1 pt-1">
                  <Label className="text-[11px]">Drawings PDF</Label>
                  {schedule.pdfPath ? (
                    <div className="bg-muted/30 flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2">
                      <FileText className="text-muted-foreground h-4 w-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs">
                          {schedule.pdfFilename}
                        </p>
                        <p className="text-muted-foreground text-[10px]">
                          {formatBytes(schedule.pdfSize ?? 0)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive h-7 w-7 p-0"
                        disabled={disabled}
                        onClick={() => handleRemove(idx, schedule.pdfPath!)}
                        aria-label="Remove drawings PDF"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="bg-muted/30 flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2">
                      <input
                        ref={(el) => {
                          fileInputRefs.current.set(schedule.id, el);
                        }}
                        type="file"
                        accept=".pdf,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          handleUpload(idx, file);
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-2 text-xs"
                        disabled={disabled || uploadingIdx === idx}
                        onClick={() =>
                          fileInputRefs.current.get(schedule.id)?.click()
                        }
                      >
                        {uploadingIdx === idx ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Upload className="h-3.5 w-3.5" />
                        )}
                        {uploadingIdx === idx
                          ? "Uploading…"
                          : "Upload drawings PDF"}
                      </Button>
                    </div>
                  )}
                  <p className="text-muted-foreground text-[11px]">
                    PDF only · max 20 MB. Embedded into the quote PDF in a
                    later phase.
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
            {ADDABLE_KINDS.filter(
              (kind) => kind !== "monitoring" || isGuardian
            ).map((kind) => {
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
