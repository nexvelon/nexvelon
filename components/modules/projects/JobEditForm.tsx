"use client";

// PROJ2-4d — edit a Job's header fields (title + contract_value). Mirrors
// ProjectEditForm's self-contained pattern (own "Edit" trigger + right-side
// Sheet) so a server parent can drop it in without owning open state. Validation
// mirrors editJobAction's server-side rules. contract_value is a manual override
// here; note it does NOT re-derive from cost centers (that stays a data-model
// invariant handled by the merge/backfill + delete-reassignment paths).

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
import { Button } from "@/components/ui/button";
import { editJobAction } from "@/app/(app)/projects/actions";
import type { DbJob } from "@/lib/types/database";

const ERROR_LABELS: Record<string, string> = {
  invalid_title: "Title is required and must be 200 characters or fewer.",
  invalid_contract_value: "Contract value must be 0 or greater.",
  not_found: "Job not found.",
};

export function JobEditForm({ job }: { job: DbJob }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(job.title ?? "");
  const [contractValue, setContractValue] = useState(
    String(job.contract_value ?? 0)
  );

  useEffect(() => {
    if (!open) return;
    setTitle(job.title ?? "");
    setContractValue(String(job.contract_value ?? 0));
    setError(null);
  }, [open, job.title, job.contract_value]);

  async function handleSave() {
    const t = title.trim();
    if (t.length === 0 || t.length > 200) {
      setError(ERROR_LABELS.invalid_title);
      return;
    }
    const cv = parseFloat(contractValue);
    if (!Number.isFinite(cv) || cv < 0) {
      setError(ERROR_LABELS.invalid_contract_value);
      return;
    }
    setSaving(true);
    setError(null);
    const res = await editJobAction({
      jobId: job.id,
      title: t,
      contract_value: cv,
    });
    setSaving(false);
    if (!res.ok) {
      setError(ERROR_LABELS[res.error] ?? res.error);
      return;
    }
    toast.success("Job updated");
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
        <SheetContent side="right" className="w-[440px] overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="font-serif text-2xl">Edit job</SheetTitle>
            <SheetDescription>
              Update the job title and contract value. Job type, source quote, and
              parent project are fixed.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4 px-4 pb-8">
            <div className="space-y-1">
              <Label className="text-xs">
                Title<span className="text-red-600"> *</span>
              </Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="Job title"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Contract value</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={contractValue}
                onChange={(e) => setContractValue(e.target.value)}
                placeholder="0.00"
                className="text-right tabular-nums"
              />
            </div>

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
                {saving ? "Saving…" : "Save job"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
