"use client";

// SITES-2b — Thin right-side drawer wrapper around the shared <SiteForm>.
// Pre-SITES-2b this file held the entire form body (~332 lines); the form
// itself now lives in _components/SiteForm.tsx so the new full-screen
// /sites/new page can reuse it. This drawer is invoked from:
//   - SitesView.tsx (row Edit pencil → edit mode)
//   - /clients/[id]/ClientDetailView.tsx (site row Edit → edit mode)
// Create mode now routes to /sites/new instead of opening this drawer, but
// the discriminated-union Mode shape is preserved so the wrapper remains
// drop-in compatible if we ever want drawer-mode create back.

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SiteForm } from "./_components/SiteForm";
import type { DbClient, DbSite } from "@/lib/types/database";

type Mode =
  | { kind: "create"; clientId?: string }
  | { kind: "edit"; site: DbSite };

interface Props {
  open: boolean;
  onClose: () => void;
  mode: Mode;
  /**
   * Full client rows used for the picker (create mode without preset) AND
   * for inheritance display (edit mode just needs the parent client). The
   * SitesView passes all clients; ClientDetailView passes [client] only.
   */
  clients: DbClient[];
}

export function SiteFormDrawer({ open, onClose, mode, clients }: Props) {
  const isEdit = mode.kind === "edit";
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-[440px] overflow-y-auto sm:max-w-lg"
      >
        <SheetHeader>
          <SheetTitle className="font-serif text-2xl">
            {isEdit ? "Edit site" : "Add site"}
          </SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update site information. Changes save immediately."
              : "Create a new operating site."}
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 py-4">
          <SiteForm
            mode={mode}
            clients={clients}
            // Drawer doesn't navigate — it just closes on success. The
            // returned id is ignored here (the page wrapper consumes it).
            onSubmitSuccess={() => onClose()}
            onCancel={onClose}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
