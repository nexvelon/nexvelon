"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  DbActivityLogWithActor,
  DbClientWithCounts,
  DbContact,
  DbSite,
} from "@/lib/types/database";
import { ClientHeader, ClientStatsRow } from "../_components/ClientHeader";
import { BillingPortalCard } from "../_components/BillingPortalCard";
import { TabBar, type TabKey } from "../_components/TabBar";
import { SitesPane } from "../_components/SitesPane";
import { ContactsPane } from "../_components/ContactsPane";
import { PlaceholderPane } from "../_components/PlaceholderPane";
import { ClientFormDrawer } from "../ClientFormDrawer";
import { AttachmentsSection } from "@/components/modules/attachments/AttachmentsSection";
import { SiteFormDrawer } from "../SiteFormDrawer";
import { ContactFormDrawer } from "../ContactFormDrawer";
import { ActivityLog } from "@/components/activity/ActivityLog";
import {
  deleteClientAction,
  deleteContactAction,
  deleteSiteAction,
} from "../actions";

interface ClientDetailViewProps {
  client: DbClientWithCounts;
  sites: DbSite[];
  contacts: DbContact[];
  // ACT-1: activity-log entries for THIS client. Server-fetched in page.tsx
  // alongside the existing data. Site/contact log entries are not surfaced
  // on this tab — they live in the DB and will render on future
  // /sites/[id] + /contacts/[id] detail pages.
  activityLog: DbActivityLogWithActor[];
}

export function ClientDetailView({
  client,
  sites,
  contacts,
  activityLog,
}: ClientDetailViewProps) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("Sites");
  const [isPending, startTransition] = useTransition();

  // Drawer state — the detail page owns every per-client operation.
  const [clientEditDrawer, setClientEditDrawer] = useState(false);
  // SITES-2b: drawer state narrows to EDIT-only — create now navigates to
  // /sites/new?clientId=X (full-screen).
  const [siteDrawer, setSiteDrawer] = useState<
    { open: false } | { open: true; site: DbSite }
  >({ open: false });
  const [contactDrawer, setContactDrawer] = useState<
    | { open: false }
    | { open: true; mode: "create"; clientId: string }
    | { open: true; mode: "edit"; contact: DbContact }
  >({ open: false });
  const [confirmDeleteClient, setConfirmDeleteClient] = useState(false);

  function handleDeleteClient() {
    startTransition(async () => {
      const result = await deleteClientAction(client.id);
      if (result.ok) {
        toast.success("Client deleted");
        router.push("/clients");
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleDeleteSite(s: DbSite) {
    if (!confirm(`Soft-delete site "${s.name}"?`)) return;
    deleteSiteAction(s.id).then((r) => {
      if (r.ok) {
        toast.success(`Deleted ${s.name}`);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function handleDeleteContact(c: DbContact) {
    const fullName = `${c.first_name} ${c.last_name}`;
    if (!confirm(`Soft-delete ${fullName}?`)) return;
    deleteContactAction(c.id).then((r) => {
      if (r.ok) {
        toast.success(`Deleted ${fullName}`);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Top bar — back link + delete affordance */}
      <div className="flex items-center justify-between">
        <Link
          href="/clients"
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          ← Back to Clients
        </Link>
        <button
          type="button"
          onClick={() => setConfirmDeleteClient(true)}
          className="text-muted-foreground inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-[11px] font-medium hover:text-red-600"
          style={{ borderColor: "var(--brand-border)" }}
        >
          <Trash2 className="h-3 w-3" />
          Delete client
        </button>
      </div>

      <ClientHeader
        client={client}
        sites={sites}
        onEdit={() => setClientEditDrawer(true)}
        onAddSite={() => router.push(`/sites/new?clientId=${client.id}`)}
      />

      <ClientStatsRow client={client} />

      <BillingPortalCard client={client} />

      <TabBar
        tab={tab}
        onChange={setTab}
        sitesCount={sites.length}
        contactsCount={contacts.length}
      />

      {tab === "Sites" && (
        <SitesPane
          client={client}
          sites={sites}
          contacts={contacts}
          onAddSite={() => router.push(`/sites/new?clientId=${client.id}`)}
          onEditSite={(s) => setSiteDrawer({ open: true, site: s })}
          onDeleteSite={handleDeleteSite}
          onAddContact={() =>
            setContactDrawer({
              open: true,
              mode: "create",
              clientId: client.id,
            })
          }
          onEditContact={(c) =>
            setContactDrawer({ open: true, mode: "edit", contact: c })
          }
          onDeleteContact={handleDeleteContact}
        />
      )}
      {tab === "Contacts" && (
        <ContactsPane
          contacts={contacts}
          onAdd={() =>
            setContactDrawer({
              open: true,
              mode: "create",
              clientId: client.id,
            })
          }
          onEdit={(c) =>
            setContactDrawer({ open: true, mode: "edit", contact: c })
          }
          onDelete={handleDeleteContact}
        />
      )}
      {tab === "Contracts" && <PlaceholderPane label="Contracts" />}
      {tab === "Service History" && (
        <PlaceholderPane label="Service history" />
      )}
      {tab === "Documents" && (
        <AttachmentsSection
          entityType="client"
          entityId={client.id}
          folders={["Documents"]}
          allowCustomFolders
          title="Documents"
        />
      )}
      {tab === "Activity" && <ActivityLog entries={activityLog} />}

      {/* Drawers */}
      {clientEditDrawer && (
        <ClientFormDrawer
          open
          onClose={() => {
            setClientEditDrawer(false);
            router.refresh();
          }}
          mode={{ kind: "edit", client }}
        />
      )}
      {siteDrawer.open && (
        <SiteFormDrawer
          open
          onClose={() => {
            setSiteDrawer({ open: false });
            router.refresh();
          }}
          mode={{ kind: "edit", site: siteDrawer.site }}
          // The edit drawer only needs the parent client (for inheritance
          // display). We pass it as a single-item array since SiteForm
          // looks the client up by id.
          clients={[client]}
        />
      )}
      {contactDrawer.open && (
        <ContactFormDrawer
          open
          onClose={() => {
            setContactDrawer({ open: false });
            router.refresh();
          }}
          sites={sites}
          mode={
            contactDrawer.mode === "edit"
              ? { kind: "edit", contact: contactDrawer.contact }
              : { kind: "create", clientId: contactDrawer.clientId }
          }
        />
      )}

      <Dialog
        open={confirmDeleteClient}
        onOpenChange={(o) => {
          if (!o && !isPending) setConfirmDeleteClient(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Delete client?</DialogTitle>
            <DialogDescription>
              {client.name} will be hidden from the active list. An admin can
              restore it later from the archived view. This will not
              permanently remove the client&apos;s records.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setConfirmDeleteClient(false)}
              disabled={isPending}
              className="text-muted-foreground hover:bg-muted rounded-md px-3 py-2 text-xs font-medium disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteClient}
              disabled={isPending}
              className="rounded-md bg-red-600 px-4 py-2 text-xs font-semibold tracking-wide text-white shadow-sm transition-colors hover:bg-red-700 disabled:opacity-60"
            >
              {isPending ? "Deleting…" : "Delete"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
