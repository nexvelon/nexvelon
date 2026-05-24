"use client";

// CL-9 — Thin right-side drawer wrapper around the shared <ClientForm>.
// Pre-CL-9 this file held the entire form body (~1400 lines); the form
// itself now lives in _components/ClientForm.tsx so the new full-screen
// /clients/new page can reuse it. This drawer is invoked from:
//   - ClientsView.tsx (row Edit pencil → edit mode)
//   - /clients/[id]/ClientDetailView.tsx (header Edit button → edit mode)
// Create mode now routes to /clients/new instead of opening this drawer,
// but we keep the discriminated-union prop shape so the wrapper remains
// drop-in compatible if we ever want a drawer-mode create back.

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ClientForm } from "./_components/ClientForm";
import type { DbClient } from "@/lib/types/database";

type Mode = { kind: "create" } | { kind: "edit"; client: DbClient };

interface Props {
  open: boolean;
  onClose: () => void;
  mode: Mode;
}

export function ClientFormDrawer({ open, onClose, mode }: Props) {
  const isEdit = mode.kind === "edit";
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-[480px] overflow-y-auto sm:max-w-xl"
      >
        <SheetHeader>
          <SheetTitle className="font-serif text-2xl">
            {isEdit ? "Edit client" : "Add client"}
          </SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update client information. Changes save immediately."
              : "Create a new master client record."}
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 py-4">
          <ClientForm
            mode={mode}
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
