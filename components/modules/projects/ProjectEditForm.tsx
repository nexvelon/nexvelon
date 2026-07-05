"use client";

// PROJ2-2 — edit the project's header fields. Mirrors the VendorFormDrawer
// pattern (right-side Sheet). Self-contained: renders its own "Edit" trigger +
// drawer so a server parent (ProjectHeader) can drop it in without owning open
// state. Validation mirrors editProjectAction's server-side rules.
//
// TODO PROJ2-4 — PM is a free-form UUID text input; a real user picker +
// project_assignments arrives with that chunk. Lead tech reuses the existing
// techs list.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { editProjectAction } from "@/app/(app)/projects/actions";
import { listActiveTechsAction } from "@/app/(app)/projects/labour-actions";
import type { DbProject, DbTech } from "@/lib/types/database";

const NO_TECH = "__none__";

export function ProjectEditForm({ project }: { project: DbProject }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [techs, setTechs] = useState<DbTech[]>([]);

  const [title, setTitle] = useState(project.title ?? "");
  const [description, setDescription] = useState(project.description ?? "");
  const [startDate, setStartDate] = useState(project.start_date ?? "");
  const [targetCompletion, setTargetCompletion] = useState(
    project.target_completion ?? ""
  );
  const [pmUserId, setPmUserId] = useState(project.pm_user_id ?? "");
  const [leadTechId, setLeadTechId] = useState(project.lead_tech_id ?? "");

  // Re-seed when (re)opened; load techs once.
  useEffect(() => {
    if (!open) return;
    setTitle(project.title ?? "");
    setDescription(project.description ?? "");
    setStartDate(project.start_date ?? "");
    setTargetCompletion(project.target_completion ?? "");
    setPmUserId(project.pm_user_id ?? "");
    setLeadTechId(project.lead_tech_id ?? "");
    setError(null);
    if (techs.length === 0) {
      listActiveTechsAction()
        .then((res) => {
          if (res.ok) setTechs(res.data);
        })
        .catch(() => {
          /* techs stay empty */
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const ERROR_LABELS: Record<string, string> = {
    invalid_title: "Title is required and must be 200 characters or fewer.",
    invalid_description: "Description must be 2000 characters or fewer.",
    invalid_start_date: "Start date is invalid.",
    invalid_target_completion: "Target completion date is invalid.",
    not_found: "Project not found.",
  };

  async function handleSave() {
    const t = title.trim();
    if (t.length === 0 || t.length > 200) {
      setError(ERROR_LABELS.invalid_title);
      return;
    }
    if (description.length > 2000) {
      setError(ERROR_LABELS.invalid_description);
      return;
    }
    setSaving(true);
    setError(null);
    const res = await editProjectAction({
      projectId: project.id,
      title: t,
      description: description.trim() || null,
      start_date: startDate || null,
      target_completion: targetCompletion || null,
      pm_user_id: pmUserId.trim() || null,
      lead_tech_id: leadTechId || null,
    });
    setSaving(false);
    if (!res.ok) {
      setError(ERROR_LABELS[res.error] ?? res.error);
      return;
    }
    toast.success("Project updated");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Pencil className="mr-1.5 h-3.5 w-3.5" />
        Edit
      </Button>

      <Sheet open={open} onOpenChange={(o) => !o && !saving && setOpen(false)}>
        <SheetContent side="right" className="w-[480px] overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="font-serif text-2xl">Edit project</SheetTitle>
            <SheetDescription>
              Update the project brief, schedule, and team. Client, site, and
              opco are fixed at conversion.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4 px-4 pb-8">
            <Field label="Title" required>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="Project title"
              />
            </Field>

            <Field label="Description">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Short project brief"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </Field>
              <Field label="Target completion">
                <Input
                  type="date"
                  value={targetCompletion}
                  onChange={(e) => setTargetCompletion(e.target.value)}
                />
              </Field>
            </div>

            <Field label="Project manager (user id)">
              <Input
                value={pmUserId}
                onChange={(e) => setPmUserId(e.target.value)}
                placeholder="User UUID"
              />
              <p className="text-muted-foreground mt-1 text-[11px]">
                Temporary — a real user picker arrives with PROJ2-4.
              </p>
            </Field>

            <Field label="Lead technician">
              <Select
                value={leadTechId || NO_TECH}
                onValueChange={(v) => setLeadTechId(!v || v === NO_TECH ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a technician…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TECH}>None</SelectItem>
                  {techs.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {error ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save project"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}
