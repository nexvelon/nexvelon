"use client";

// PROJ2-16 — the Site log tab on the job detail page. A reverse-chronological
// list of daily field reports (date, weather, crew/hours, work snippet, status,
// photos) + an editor drawer. "New daily log" defaults to today and OPENS the
// existing day rather than erroring when one already exists.
//
// Mobile: the field lead fills this on a phone. The editor stacks every field
// (single column), uses full-width inputs and large tap targets, and the crew
// quick-pick is wrapping chips — so it stays usable at narrow widths without a
// separate mobile app. The list table scrolls horizontally inside its own
// container rather than breaking the page.

import { useEffect, useState } from "react";
import {
  Plus, CloudSun, Users, Clock, Camera, Trash2, X, Upload, Check, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  listLogsForJobAction, getLogByIdAction, createLogAction, updateLogAction,
  submitLogAction, deleteLogAction, addCrewAction, updateCrewAction, removeCrewAction,
} from "@/app/(app)/projects/site-log-actions";
import { listAssignmentsForJobAction } from "@/app/(app)/projects/assignment-actions";
import { listAttachments, createAttachment, deleteAttachment, getSignedDownloadUrlAction } from "@/app/(app)/attachments/actions";
import { uploadViaSignedUrl } from "@/lib/attachments/upload-client";
import type { SiteLogListRow, SiteLogDetail } from "@/lib/api/site-logs";
import type { AssignmentRow } from "@/lib/api/job-assignments";
import type { DbAttachment } from "@/lib/types/database";
import { cn } from "@/lib/utils";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-[color-mix(in_oklab,var(--brand-status-green)_18%,transparent)] text-[var(--brand-status-green)]",
};

export function SiteLogTab({
  jobId,
  projectId,
  canEdit,
}: {
  jobId: string;
  projectId: string;
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<SiteLogListRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => {
    listLogsForJobAction(jobId).then((res) => {
      if (res.ok) setRows(res.data);
    });
  };
  useEffect(load, [jobId]);

  const handleNew = async () => {
    setCreating(true);
    try {
      const res = await createLogAction({ jobId, logDate: todayIso() }, projectId);
      if (!res.ok) {
        // Today's log already exists → open it instead of erroring.
        if (res.error === "log_exists" && res.existingId) {
          setOpenId(res.existingId);
          return;
        }
        toast.error(res.error);
        return;
      }
      load();
      setOpenId(res.data.id);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-brand-navy font-serif text-base">Daily field reports</h3>
        {canEdit && (
          <Button type="button" size="xs" onClick={handleNew} disabled={creating}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New daily log
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <Card className="p-6 text-center shadow-sm">
          <p className="text-muted-foreground text-sm">
            No site logs yet.{canEdit ? " Start today's field report." : ""}
          </p>
        </Card>
      ) : (
        <Card className="p-0 shadow-sm">
          <ul className="divide-y divide-[var(--border)]">
            {rows.map((r) => (
              <li
                key={r.id}
                className="hover:bg-muted/40 flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-xs"
                onClick={() => setOpenId(r.id)}
              >
                <span className="text-brand-charcoal w-24 shrink-0 font-mono font-medium tabular-nums">{r.log_date}</span>
                {r.weather && (
                  <span className="text-muted-foreground inline-flex items-center gap-1">
                    <CloudSun className="h-3 w-3" /> {r.weather}
                  </span>
                )}
                <span className="text-muted-foreground inline-flex items-center gap-1">
                  <Users className="h-3 w-3" /> {r.crew_count}
                </span>
                {r.hours_total > 0 && (
                  <span className="text-muted-foreground inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {r.hours_total}h
                  </span>
                )}
                {r.photo_count > 0 && (
                  <span className="text-muted-foreground inline-flex items-center gap-1">
                    <Camera className="h-3 w-3" /> {r.photo_count}
                  </span>
                )}
                {r.work_performed && (
                  <span className="text-muted-foreground line-clamp-1 min-w-0 flex-1">{r.work_performed}</span>
                )}
                <span className={cn("ml-auto inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_TONE[r.status])}>
                  {r.status === "submitted" ? "Submitted" : "Draft"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {openId && (
        <LogEditor
          logId={openId}
          jobId={jobId}
          projectId={projectId}
          canEdit={canEdit}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

// ─── Editor ──────────────────────────────────────────────────────────────────

function LogEditor({
  logId,
  jobId,
  projectId,
  canEdit,
  onClose,
  onChanged,
}: {
  logId: string;
  jobId: string;
  projectId: string;
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<SiteLogDetail | null>(null);
  const [saving, setSaving] = useState(false);
  // local field state
  const [weather, setWeather] = useState("");
  const [temp, setTemp] = useState("");
  const [work, setWork] = useState("");
  const [delays, setDelays] = useState("");
  const [materials, setMaterials] = useState("");
  const [visitors, setVisitors] = useState("");
  const [safety, setSafety] = useState("");

  const reload = () => {
    getLogByIdAction(logId).then((res) => {
      if (!res.ok || !res.data) return;
      const d = res.data;
      setDetail(d);
      setWeather(d.weather ?? "");
      setTemp(d.temperature_c != null ? String(d.temperature_c) : "");
      setWork(d.work_performed ?? "");
      setDelays(d.delays_issues ?? "");
      setMaterials(d.materials_received ?? "");
      setVisitors(d.visitors ?? "");
      setSafety(d.safety_notes ?? "");
    });
  };
  useEffect(reload, [logId]);

  const submitted = detail?.status === "submitted";

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await updateLogAction(logId, projectId, jobId, {
        weather: weather.trim() || null,
        temperatureC: temp.trim() === "" ? null : Number(temp),
        workPerformed: work.trim() || null,
        delaysIssues: delays.trim() || null,
        materialsReceived: materials.trim() || null,
        visitors: visitors.trim() || null,
        safetyNotes: safety.trim() || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Saved");
      reload();
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      // Save current edits first, then finalise.
      await handleSaveSilently();
      const res = await submitLogAction(logId, projectId, jobId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Field report submitted");
      reload();
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSilently = async () => {
    await updateLogAction(logId, projectId, jobId, {
      weather: weather.trim() || null,
      temperatureC: temp.trim() === "" ? null : Number(temp),
      workPerformed: work.trim() || null,
      delaysIssues: delays.trim() || null,
      materialsReceived: materials.trim() || null,
      visitors: visitors.trim() || null,
      safetyNotes: safety.trim() || null,
    });
  };

  const handleDelete = async () => {
    const res = await deleteLogAction(logId, projectId, jobId);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Log deleted");
    onChanged();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Site log — {detail?.log_date ?? "…"}
            {detail && (
              <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_TONE[detail.status])}>
                {detail.status === "submitted" ? "Submitted" : "Draft"}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {submitted
              ? "Submitted — edits are still allowed and are recorded as amendments."
              : "The day's field report. Fill what applies; submit when the day is done."}
          </DialogDescription>
        </DialogHeader>

        {!detail ? (
          <p className="text-muted-foreground text-xs">Loading…</p>
        ) : (
          <div className="space-y-3">
            {/* Single-column stacked layout — phone-friendly. */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Weather">
                <Input value={weather} onChange={(e) => setWeather(e.target.value)} disabled={!canEdit} className="h-10 text-sm" placeholder="Sunny, windy…" />
              </Field>
              <Field label="Temp (°C)">
                <Input value={temp} inputMode="decimal" onChange={(e) => setTemp(e.target.value)} disabled={!canEdit} className="h-10 text-sm tabular-nums" />
              </Field>
            </div>
            <Field label="Work performed">
              <Textarea value={work} onChange={setWork} disabled={!canEdit} rows={3} />
            </Field>
            <Field label="Materials received">
              <Textarea value={materials} onChange={setMaterials} disabled={!canEdit} rows={2} />
            </Field>
            <Field label="Delays / issues">
              <Textarea value={delays} onChange={setDelays} disabled={!canEdit} rows={2} />
            </Field>
            <Field label="Visitors">
              <Input value={visitors} onChange={(e) => setVisitors(e.target.value)} disabled={!canEdit} className="h-10 text-sm" placeholder="Inspector, client…" />
            </Field>
            <Field label="Safety notes">
              <Textarea value={safety} onChange={setSafety} disabled={!canEdit} rows={2} />
            </Field>

            {/* Crew */}
            <CrewSection
              detail={detail}
              jobId={jobId}
              projectId={projectId}
              canEdit={canEdit}
              onChanged={() => {
                reload();
                onChanged();
              }}
            />

            {/* Photos */}
            <LogPhotos logId={logId} canEdit={canEdit} />
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          {canEdit && (
            <Button type="button" variant="outline" onClick={handleDelete} className="mr-auto text-destructive">
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          {canEdit && (
            <>
              <Button type="button" variant="outline" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
              {!submitted && (
                <Button type="button" onClick={handleSubmit} disabled={saving}>
                  <Check className="mr-1 h-3.5 w-3.5" /> Submit day
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Crew section ────────────────────────────────────────────────────────────

function CrewSection({
  detail,
  jobId,
  projectId,
  canEdit,
  onChanged,
}: {
  detail: SiteLogDetail;
  jobId: string;
  projectId: string;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [team, setTeam] = useState<AssignmentRow[]>([]);
  const [freeName, setFreeName] = useState("");
  const [hours, setHours] = useState("");
  const [picked, setPicked] = useState<string>("free"); // "free" | "tech:<id>" | "sub:<id>"
  // Inline hours edit on a saved crew line (PROJ2-16 was remove-and-re-add only).
  const [editId, setEditId] = useState<string | null>(null);
  const [editHours, setEditHours] = useState("");

  useEffect(() => {
    listAssignmentsForJobAction(jobId).then((r) => {
      if (r.ok) setTeam(r.data.filter((a) => a.status === "active"));
    });
  }, [jobId]);

  const add = async () => {
    const hoursNum = hours.trim() === "" ? null : Number(hours);
    let input;
    if (picked === "free") {
      if (!freeName.trim()) {
        toast.error("Pick someone or type a name.");
        return;
      }
      input = { siteLogId: detail.id, personName: freeName.trim(), hours: hoursNum };
    } else if (picked.startsWith("tech:")) {
      input = { siteLogId: detail.id, techId: picked.slice(5), hours: hoursNum };
    } else {
      input = { siteLogId: detail.id, subcontractorId: picked.slice(4), hours: hoursNum };
    }
    const res = await addCrewAction(input, projectId, jobId);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setFreeName(""); setHours(""); setPicked("free");
    onChanged();
  };

  const remove = async (id: string) => {
    const res = await removeCrewAction(id, projectId, jobId);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    onChanged();
  };

  const startEdit = (id: string, current: number | null) => {
    setEditId(id);
    setEditHours(current != null ? String(current) : "");
  };
  const saveEdit = async (id: string) => {
    const trimmed = editHours.trim();
    const h = trimmed === "" ? null : Number(trimmed);
    if (h != null && (!Number.isFinite(h) || h < 0)) {
      toast.error("Enter valid hours (0 or more), or blank to clear.");
      return;
    }
    const res = await updateCrewAction(id, projectId, jobId, { hours: h });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setEditId(null);
    onChanged();
  };

  return (
    <div className="space-y-2 rounded-md border border-[var(--border)] p-3">
      <Label className="text-muted-foreground text-[11px] uppercase tracking-wide">Crew on site</Label>
      {detail.crew.length === 0 ? (
        <p className="text-muted-foreground text-[11px]">No crew recorded.</p>
      ) : (
        <ul className="space-y-1">
          {detail.crew.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-xs">
              <span className="text-brand-charcoal font-medium">{c.display_name}</span>
              {c.kind !== "other" && <span className="text-muted-foreground text-[10px]">({c.kind === "tech" ? "in-house" : "sub"})</span>}
              {editId === c.id ? (
                <span className="ml-auto flex items-center gap-1">
                  <Input
                    value={editHours}
                    inputMode="decimal"
                    onChange={(e) => setEditHours(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveEdit(c.id); if (e.key === "Escape") setEditId(null); }}
                    autoFocus
                    className="h-7 w-16 text-xs tabular-nums"
                    placeholder="hrs"
                  />
                  <button type="button" onClick={() => saveEdit(c.id)} className="text-[var(--brand-status-green)] hover:opacity-80" aria-label="Save hours">
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => setEditId(null)} className="text-muted-foreground hover:text-brand-charcoal" aria-label="Cancel">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ) : (
                <>
                  <span className="text-muted-foreground tabular-nums">{c.hours != null ? `${c.hours}h` : "—"}</span>
                  {canEdit && (
                    <span className="ml-auto flex items-center gap-2">
                      <button type="button" onClick={() => startEdit(c.id, c.hours)} className="text-muted-foreground hover:text-brand-navy" aria-label="Edit hours">
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button type="button" onClick={() => remove(c.id)} className="text-muted-foreground hover:text-red-600" aria-label="Remove crew">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="space-y-2 border-t border-[var(--border)] pt-2">
          {/* Quick-pick from the job's assigned team, or free text. */}
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setPicked("free")}
              className={cn("rounded-full border px-2 py-1 text-[10px]", picked === "free" ? "border-brand-navy bg-[color-mix(in_oklab,var(--brand-navy)_12%,transparent)]" : "border-[var(--border)]")}
            >
              Someone else
            </button>
            {team.map((a) => {
              const key = `${a.assignee_kind}:${a.assignee_kind === "tech" ? a.tech_id : a.subcontractor_id}`;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setPicked(key)}
                  className={cn("rounded-full border px-2 py-1 text-[10px]", picked === key ? "border-brand-navy bg-[color-mix(in_oklab,var(--brand-navy)_12%,transparent)]" : "border-[var(--border)]")}
                >
                  {a.assignee_name}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {picked === "free" && (
              <Input value={freeName} onChange={(e) => setFreeName(e.target.value)} placeholder="Name" className="h-9 flex-1 text-sm" />
            )}
            <Input value={hours} inputMode="decimal" onChange={(e) => setHours(e.target.value)} placeholder="Hrs" className="h-9 w-20 text-sm tabular-nums" />
            <Button type="button" size="xs" onClick={add}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Photos ──────────────────────────────────────────────────────────────────

function LogPhotos({ logId, canEdit }: { logId: string; canEdit: boolean }) {
  const [photos, setPhotos] = useState<DbAttachment[]>([]);
  const [uploading, setUploading] = useState(false);

  const load = () => {
    listAttachments("site_log", logId).then((r) => r.ok && setPhotos(r.data));
  };
  useEffect(load, [logId]);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const up = await uploadViaSignedUrl({ entityType: "site_log", entityId: logId, file });
      if (!up.ok) { toast.error(up.error); return; }
      const att = await createAttachment("site_log", logId, "Photos", {
        path: up.path, filename: file.name, contentType: file.type, size: file.size,
      });
      if (!att.ok) { toast.error(att.error); return; }
      load();
    } finally {
      setUploading(false);
    }
  };

  const view = async (id: string) => {
    const res = await getSignedDownloadUrlAction({ attachmentId: id });
    if (res.ok) window.open(res.signedUrl, "_blank", "noopener,noreferrer");
    else toast.error(res.error);
  };

  const remove = async (id: string) => {
    const res = await deleteAttachment(id);
    if (!res.ok) { toast.error(res.error); return; }
    load();
  };

  return (
    <div className="space-y-1.5 rounded-md border border-[var(--border)] p-3">
      <div className="flex items-center justify-between">
        <Label className="text-muted-foreground text-[11px] uppercase tracking-wide">Photos</Label>
        {canEdit && (
          <label className="text-brand-navy inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium">
            <Upload className="h-3 w-3" /> {uploading ? "Uploading…" : "Add photo"}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
          </label>
        )}
      </div>
      {photos.length === 0 ? (
        <p className="text-muted-foreground text-[11px]">No photos.</p>
      ) : (
        <ul className="space-y-1">
          {photos.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-xs">
              <button type="button" onClick={() => view(p.id)} className="text-brand-navy inline-flex items-center gap-1 hover:underline">
                <Camera className="h-3 w-3" /> {p.filename}
              </button>
              {canEdit && (
                <button type="button" onClick={() => remove(p.id)} className="text-muted-foreground ml-auto hover:text-red-600" aria-label="Remove photo">
                  <X className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Textarea({ value, onChange, disabled, rows }: { value: string; onChange: (v: string) => void; disabled?: boolean; rows: number }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      rows={rows}
      className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm disabled:opacity-70"
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-muted-foreground text-[11px] uppercase tracking-wide">{label}</Label>
      {children}
    </div>
  );
}
