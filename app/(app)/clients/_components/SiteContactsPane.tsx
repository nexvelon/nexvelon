"use client";

// POLISH-58 — site-detail Contacts section WITH CRUD. Mirrors the client
// ContactsPane pattern (POLISH-50 kept the read-only list; this adds Add / Edit /
// Delete) without touching the shared ContactsPane. The add/edit form reuses the
// shared ContactFormDrawer in its "create-site" mode, which forces
// client_id = NULL + site_id = this site (POLISH-49 scoping). Add/Edit/Delete are
// gated to Admin + ProjectManager; everyone else sees the read-only list.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Mail, Phone, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRole } from "@/lib/role-context";
import type { DbContact } from "@/lib/types/database";
import { initials } from "./shared";
import { ContactFormDrawer } from "../ContactFormDrawer";
import { deleteContactAction } from "../actions";

function roleBadges(c: DbContact): Array<{ label: string; cls: string }> {
  const badges: Array<{ label: string; cls: string }> = [];
  if (c.is_primary) badges.push({ label: "Primary", cls: "bg-brand-gold/15 text-amber-800" });
  if (c.is_accounts_payable) badges.push({ label: "AP", cls: "bg-blue-100 text-blue-800" });
  if (c.is_billing) badges.push({ label: "Billing", cls: "bg-emerald-100 text-emerald-800" });
  if (c.is_emergency) badges.push({ label: "Emergency", cls: "bg-red-100 text-red-800" });
  const custom = c.contact_type_custom?.trim();
  if (custom) badges.push({ label: custom.slice(0, 24), cls: "bg-purple-100 text-purple-800" });
  return badges;
}

export function SiteContactsPane({
  siteId,
  contacts,
}: {
  siteId: string;
  contacts: DbContact[];
}) {
  const router = useRouter();
  const { role } = useRole();
  const canEdit = role === "Admin" || role === "ProjectManager";

  const [drawer, setDrawer] = useState<
    | { open: false }
    | { open: true; mode: { kind: "create-site"; siteId: string } }
    | { open: true; mode: { kind: "edit"; contact: DbContact } }
  >({ open: false });
  const [confirmDelete, setConfirmDelete] = useState<DbContact | null>(null);
  const [deleting, startDelete] = useTransition();

  const doDelete = () => {
    if (!confirmDelete) return;
    const c = confirmDelete;
    startDelete(async () => {
      const r = await deleteContactAction(c.id);
      if (r.ok) {
        console.error("[SITE CONTACT DELETE]", { siteId, contactId: c.id });
        toast.success(`Deleted ${c.first_name} ${c.last_name}`);
        setConfirmDelete(null);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  };

  return (
    <Card className="p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="nx-eyebrow">Contacts</p>
        {canEdit && (
          <button
            type="button"
            onClick={() => setDrawer({ open: true, mode: { kind: "create-site", siteId } })}
            className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-0.5 text-[10px] font-medium hover:bg-muted/40"
            style={{ borderColor: "var(--brand-border)", color: "var(--brand-text)" }}
          >
            <Plus className="h-3 w-3" />
            Add Contact
          </button>
        )}
      </div>

      {contacts.length === 0 ? (
        <p className="text-muted-foreground py-3 text-center text-xs">No contacts yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {contacts.map((c) => (
            <li key={c.id} className="group flex items-center gap-3 py-2.5">
              <Avatar className="h-8 w-8">
                <AvatarFallback
                  className="text-[10px] font-semibold text-white"
                  style={{ background: "var(--brand-primary)" }}
                >
                  {initials(`${c.first_name} ${c.last_name}`)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-brand-text text-sm font-medium leading-tight">
                  {c.first_name} {c.last_name}
                  {roleBadges(c).length > 0 && (
                    <span className="ml-2 inline-flex gap-1">
                      {roleBadges(c).map((b) => (
                        <span
                          key={b.label}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${b.cls}`}
                          title={b.label}
                        >
                          {b.label}
                        </span>
                      ))}
                    </span>
                  )}
                </p>
                {c.email && (
                  <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
                    <Mail className="h-3 w-3" />
                    {c.email}
                  </span>
                )}
              </div>
              {c.phones.length > 0 && (
                <div className="text-muted-foreground hidden space-y-0.5 text-[11px] sm:block">
                  {c.phones.map((p, idx) => (
                    <div key={idx} className="inline-flex items-center gap-1.5">
                      <Phone className="h-3 w-3" />
                      <span>{p.label}:</span>
                      <span className="text-brand-text">{p.number}</span>
                    </div>
                  ))}
                </div>
              )}
              {canEdit && (
                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => setDrawer({ open: true, mode: { kind: "edit", contact: c } })}
                    className="text-muted-foreground hover:bg-muted hover:text-brand-charcoal rounded p-1"
                    aria-label="Edit contact"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(c)}
                    className="text-muted-foreground hover:bg-muted rounded p-1 hover:text-red-600"
                    aria-label="Delete contact"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {drawer.open && (
        <ContactFormDrawer
          open
          onClose={() => {
            setDrawer({ open: false });
            router.refresh();
          }}
          mode={drawer.mode}
        />
      )}

      <Dialog
        open={!!confirmDelete}
        onOpenChange={(o) => {
          if (!o && !deleting) setConfirmDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Delete contact?</DialogTitle>
            <DialogDescription>
              {confirmDelete
                ? `${confirmDelete.first_name} ${confirmDelete.last_name} will be permanently removed from this site. This cannot be undone.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setConfirmDelete(null)}
              disabled={deleting}
              className="text-muted-foreground hover:bg-muted rounded-md px-3 py-2 text-xs font-medium disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={doDelete}
              disabled={deleting}
              className="rounded-md bg-red-600 px-4 py-2 text-xs font-semibold tracking-wide text-white shadow-sm transition-colors hover:bg-red-700 disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
