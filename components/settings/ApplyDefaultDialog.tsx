"use client";

// AUD-1 — a reusable "set a company default over people's personal choices"
// confirmation. Generic by `subject` so UIDG-8 can reuse it for dashboard
// layouts (same shape, different subject). Two explicit outcomes:
//   • Apply to everyone → clears personal overrides so all inherit the default
//   • Keep their choices → sets the default; only affects users who never chose
// The caller decides whether to open it at all (skip when zero are affected).

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function ApplyDefaultDialog({
  open,
  onOpenChange,
  subject,
  targetName,
  affectedCount,
  pending,
  onApplyToEveryone,
  onKeepChoices,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** e.g. "theme" or "dashboard layout". */
  subject: string;
  /** the thing being made default, e.g. "Onyx & Brass". */
  targetName: string;
  /** how many users currently have their own choice. */
  affectedCount: number;
  pending?: boolean;
  onApplyToEveryone: () => void;
  onKeepChoices: () => void;
}) {
  const people = `${affectedCount} ${affectedCount === 1 ? "person has" : "people have"}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Set “{targetName}” as the company default {subject}?</DialogTitle>
          <DialogDescription>
            {people} chosen their own {subject}. Choose how this default applies:
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-xs">
          <p className="text-muted-foreground">
            <strong>Apply to everyone</strong> resets their personal choice so they see the new
            default. It only clears the preference — no one&apos;s saved {subject}s are deleted,
            and they can pick again anytime.
          </p>
          <p className="text-muted-foreground">
            <strong>Keep their choices</strong> sets the default only for people who never picked
            one.
          </p>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onKeepChoices} disabled={pending}>
            Keep their choices
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onApplyToEveryone}
            disabled={pending}
            className="bg-brand-gold text-brand-navy hover:bg-brand-gold/90"
          >
            Apply to everyone ({affectedCount})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
