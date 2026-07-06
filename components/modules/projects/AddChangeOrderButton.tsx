"use client";

// PROJ2-4d — manual "Add Change Order" on the project detail page. Creates a C.O
// Job with NO source quote (scope discovered during install). Sits above the
// Jobs table, canEdit only. On success it navigates straight to the new job's
// detail page so the operator can start filling it in.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addChangeOrderJobAction } from "@/app/(app)/projects/actions";

const ERROR_LABELS: Record<string, string> = {
  invalid_title: "Title is required and must be 200 characters or fewer.",
  invalid_contract_value: "Contract value must be 0 or greater.",
};

export function AddChangeOrderButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [contractValue, setContractValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setTitle("");
    setContractValue("");
    setError(null);
    setOpen(true);
  }

  async function save() {
    const t = title.trim();
    if (t.length === 0 || t.length > 200) {
      setError(ERROR_LABELS.invalid_title);
      return;
    }
    const cv = contractValue.trim() === "" ? 0 : parseFloat(contractValue);
    if (!Number.isFinite(cv) || cv < 0) {
      setError(ERROR_LABELS.invalid_contract_value);
      return;
    }
    setSaving(true);
    setError(null);
    const res = await addChangeOrderJobAction({
      projectId,
      title: t,
      contractValue: cv,
    });
    setSaving(false);
    if (!res.ok) {
      setError(ERROR_LABELS[res.error] ?? res.error);
      return;
    }
    toast.success("Change order added");
    setOpen(false);
    router.push(`/projects/${projectId}/jobs/${res.data.jobId}`);
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={openDialog}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Add Change Order
      </Button>

      <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add change order</DialogTitle>
            <DialogDescription>
              Create a Change Order for scope that didn&apos;t originate from a
              quote. The C.O number is assigned automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">
                Title<span className="text-red-600"> *</span>
              </Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="e.g. Added rear-door reader"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Contract value (optional)</Label>
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
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? "Adding…" : "Add change order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
