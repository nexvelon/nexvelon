"use client";

// POLISH-17 — locked legal-document editor (Integrated + Guardian T&C). Read-only
// by default with a Lock indicator + Edit button. Editing requires confirming a
// "this is a legal document" dialog; saving appends an immutable audit row via
// saveLegalDocumentAction and re-locks. Cancel discards edits.

import { useEffect, useState, useTransition } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useRole } from "@/lib/role-context";
import { saveLegalDocumentAction } from "@/app/(app)/settings/settings-audit-actions";

type LoadResult = { ok: true; data: string | null } | { ok: false; error: string };

export function LegalDocEditor({
  title,
  companyName,
  settingKey,
  fallback,
  load,
  onSaved,
  reloadKey = 0,
}: {
  title: string;
  companyName: string;
  settingKey: string;
  fallback: string;
  load: () => Promise<LoadResult>;
  /** Called after a successful save so the parent can refresh the audit log. */
  onSaved?: () => void;
  /** Bump to force a re-fetch (e.g. after a restore elsewhere on the page). */
  reloadKey?: number;
}) {
  const { role } = useRole();
  const [value, setValue] = useState<string>(fallback);
  const [draft, setDraft] = useState<string>(fallback);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startSave] = useTransition();

  useEffect(() => {
    if (role !== "Admin") return;
    let active = true;
    load()
      .then((res) => {
        if (active && res.ok && res.data != null) {
          setValue(res.data);
          setDraft(res.data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [role, load, reloadKey]);

  if (role !== "Admin") return null;

  const beginEdit = () => {
    setDraft(value);
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft(value); // discard
    setEditing(false);
  };

  const handleSave = () => {
    startSave(async () => {
      const res = await saveLegalDocumentAction(settingKey, draft);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setValue(draft);
      setEditing(false);
      toast.success("Saved — change recorded in the audit log.");
      onSaved?.();
    });
  };

  return (
    <Card className="bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-brand-navy flex items-center gap-2 font-serif text-base">
            {title}
            {!editing && (
              <span
                className="text-muted-foreground inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                title="Locked — click Edit to make changes"
              >
                <Lock className="h-3 w-3" /> Read-only
              </span>
            )}
          </h4>
          <p className="text-muted-foreground mt-1 text-[11px]">
            Legal document. Shown on the Terms schedule of every new quote using
            this entity and on the onboarding T&amp;C step. Every change is logged
            and can be reviewed or rolled back below.
          </p>
        </div>
        {!editing && (
          <Button
            variant="outline"
            onClick={() => setConfirmOpen(true)}
            disabled={loading}
            className="shrink-0"
          >
            Edit
          </Button>
        )}
      </div>

      <Textarea
        value={editing ? draft : value}
        onChange={(e) => setDraft(e.target.value)}
        readOnly={!editing}
        rows={18}
        disabled={loading || pending}
        className={`mt-3 font-mono text-xs leading-relaxed ${
          editing ? "" : "bg-muted/40 cursor-default"
        }`}
      />

      {editing && (
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" onClick={cancelEdit} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">
              Edit {companyName} Terms &amp; Conditions?
            </DialogTitle>
            <DialogDescription>
              This is a legal document. Are you sure you want to make changes? All
              changes are logged and can be reviewed or rolled back from the Audit
              Log.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                beginEdit();
              }}
            >
              Yes, Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
