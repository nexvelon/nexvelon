"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Gem, MapPin, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRole } from "@/lib/role-context";
import { sendSiteInviteAction, setClientTierAction } from "../invite-actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  DbActivityLogWithActor,
  DbClientWithCounts,
  DbClientTier,
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
  const { role } = useRole();
  const isAdmin = role === "Admin";
  const [tab, setTab] = useState<TabKey>("Sites");
  const [isPending, startTransition] = useTransition();

  // POLISH-4 — Type B "Invite to add a site": emails an onboarding link
  // (site + both T&Cs) for this existing client. Email prefilled but editable.
  const [siteInviteOpen, setSiteInviteOpen] = useState(false);
  const [siteInviteEmail, setSiteInviteEmail] = useState(
    client.portal_contact_email ?? ""
  );
  const [siteInviteSending, setSiteInviteSending] = useState(false);
  const sendSiteInvite = () => {
    setSiteInviteSending(true);
    sendSiteInviteAction(client.id, siteInviteEmail).then((r) => {
      setSiteInviteSending(false);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Site invite sent to ${siteInviteEmail.trim()}`);
      setSiteInviteOpen(false);
    });
  };

  // POLISH-5 (CHANGE 6) — admin tier edit, with optional notify-by-email.
  const TIER_OPTIONS: DbClientTier[] = ["Bronze", "Silver", "Gold", "Platinum"];
  const TIER_NONE = "__none__";
  const [tierOpen, setTierOpen] = useState(false);
  const [tierValue, setTierValue] = useState<string>(client.tier ?? TIER_NONE);
  const [tierNotify, setTierNotify] = useState(true);
  const [tierSaving, setTierSaving] = useState(false);
  const saveTier = () => {
    const next = tierValue === TIER_NONE ? null : (tierValue as DbClientTier);
    setTierSaving(true);
    setClientTierAction(client.id, next, tierNotify).then((r) => {
      setTierSaving(false);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        r.data.changed
          ? `Tier set to ${next ?? "None"}${tierNotify && next ? " — client notified" : ""}`
          : "No tier change"
      );
      setTierOpen(false);
      router.refresh();
    });
  };

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
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setTierValue(client.tier ?? TIER_NONE);
                setTierNotify(true);
                setTierOpen(true);
              }}
              className="text-muted-foreground inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-[11px] font-medium hover:text-brand-navy"
              style={{ borderColor: "var(--brand-border)" }}
            >
              <Gem className="h-3 w-3" />
              Edit Tier
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setSiteInviteOpen(true)}
              className="text-muted-foreground inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-[11px] font-medium hover:text-brand-navy"
              style={{ borderColor: "var(--brand-border)" }}
            >
              <MapPin className="h-3 w-3" />
              Invite to add a site
            </button>
          )}
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
      </div>

      {/* POLISH-4 — Type B site-only invite dialog */}
      <Dialog
        open={siteInviteOpen}
        onOpenChange={(o) => !siteInviteSending && setSiteInviteOpen(o)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">
              Invite {client.name} to add a site
            </DialogTitle>
            <DialogDescription>
              We&apos;ll email an onboarding link (site form + both T&amp;Cs to
              sign). On submit, a new site is attached to this client for review
              — no new client is created.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Send to email</label>
            <Input
              type="email"
              value={siteInviteEmail}
              onChange={(e) => setSiteInviteEmail(e.target.value)}
              placeholder="contact@client.com"
              onKeyDown={(e) => {
                if (e.key === "Enter" && siteInviteEmail.trim()) sendSiteInvite();
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSiteInviteOpen(false)}
              disabled={siteInviteSending}
            >
              Cancel
            </Button>
            <Button
              onClick={sendSiteInvite}
              disabled={siteInviteSending || !siteInviteEmail.trim()}
            >
              {siteInviteSending ? "Sending…" : "Send site invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* POLISH-5 — Edit Tier dialog (admin) */}
      <Dialog open={tierOpen} onOpenChange={(o) => !tierSaving && setTierOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Edit Prestige Tier</DialogTitle>
            <DialogDescription>
              Set {client.name}&apos;s tier. With notify on, the client is emailed
              the tier description (from Settings) when the tier actually changes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Tier</label>
              <Select
                value={tierValue}
                onValueChange={(v) => setTierValue(v ?? TIER_NONE)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TIER_NONE}>None</SelectItem>
                  {TIER_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={tierNotify}
                onChange={(e) => setTierNotify(e.target.checked)}
                className="h-4 w-4"
                style={{ accentColor: "var(--brand-accent)" }}
              />
              Notify client by email
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTierOpen(false)}
              disabled={tierSaving}
            >
              Cancel
            </Button>
            <Button onClick={saveTier} disabled={tierSaving}>
              {tierSaving ? "Saving…" : "Save tier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
