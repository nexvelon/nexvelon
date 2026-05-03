"use client";

import { useMemo, useState, useTransition } from "react";
import { format, parseISO } from "date-fns";
import {
  Building2,
  Download,
  Edit3,
  Mail,
  Phone,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ClientFormDrawer } from "./ClientFormDrawer";
import { SiteFormDrawer } from "./SiteFormDrawer";
import { ContactFormDrawer } from "./ContactFormDrawer";
import {
  deleteClientAction,
  deleteContactAction,
  deleteSiteAction,
} from "./actions";
import type {
  DbClient,
  DbClientTier,
  DbClientWithCounts,
  DbContact,
  DbSite,
} from "@/lib/types/database";

const TIER_BADGE: Record<
  DbClientTier,
  { label: string; bg: string; text: string }
> = {
  Platinum: { label: "P", bg: "var(--brand-primary)", text: "var(--brand-bg)" },
  Gold: { label: "G", bg: "var(--brand-accent)", text: "var(--brand-primary)" },
  Silver: { label: "S", bg: "#A8B0C4", text: "#0A1226" },
  Bronze: { label: "B", bg: "var(--brand-accent-soft)", text: "var(--brand-bg)" },
};

const TABS = [
  "Sites",
  "Contacts",
  "Contracts",
  "Service History",
  "Documents",
  "Activity",
] as const;
type TabKey = (typeof TABS)[number];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

interface Props {
  clients: DbClientWithCounts[];
  sitesByClient: Record<string, DbSite[]>;
  contactsByClient: Record<string, DbContact[]>;
}

export function ClientsView({ clients, sitesByClient, contactsByClient }: Props) {
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(
    clients[0]?.id ?? null
  );
  const [tab, setTab] = useState<TabKey>("Sites");

  // Drawer state
  const [clientDrawer, setClientDrawer] = useState<
    | { open: false }
    | { open: true; mode: "create" }
    | { open: true; mode: "edit"; client: DbClient }
  >({ open: false });
  const [siteDrawer, setSiteDrawer] = useState<
    | { open: false }
    | { open: true; mode: "create"; clientId: string }
    | { open: true; mode: "edit"; site: DbSite }
  >({ open: false });
  const [contactDrawer, setContactDrawer] = useState<
    | { open: false }
    | { open: true; mode: "create"; clientId: string }
    | { open: true; mode: "edit"; contact: DbContact }
  >({ open: false });

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.legal_name?.toLowerCase().includes(q) ?? false) ||
        (c.client_code?.toLowerCase().includes(q) ?? false)
    );
  }, [clients, search]);

  const selected =
    clients.find((c) => c.id === activeId) ?? clients[0] ?? null;

  const totalSites = Object.values(sitesByClient).reduce(
    (s, arr) => s + arr.length,
    0
  );

  // ─── Empty state ─────────────────────────────────────────────────────────
  if (clients.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="0 active clients · 0 sites"
          title="Clients & Sites"
          description="Master directory · contracts · service history"
        />
        <Card className="border-dashed py-16 text-center" style={{ background: "var(--brand-card)" }}>
          <div
            className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full"
            style={{
              border: "1px solid color-mix(in oklab, var(--brand-accent) 50%, transparent)",
            }}
          >
            <Building2 className="h-6 w-6" style={{ color: "var(--brand-accent)" }} />
          </div>
          <p className="nx-eyebrow mb-2">Clients module</p>
          <h2
            className="font-serif text-3xl tracking-tight"
            style={{ color: "var(--brand-primary)" }}
          >
            No clients yet
          </h2>
          <p className="nx-subtitle mx-auto mt-2 max-w-md text-sm">
            Add your first client to start tracking sites, contacts, and
            service history. Everything you add is stored in Supabase.
          </p>
          <button
            type="button"
            onClick={() => setClientDrawer({ open: true, mode: "create" })}
            className="mt-6 inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold tracking-wide shadow-sm transition-shadow hover:shadow-md"
            style={{
              background: "var(--brand-accent)",
              color: "var(--brand-primary)",
              fontFamily: "var(--font-playfair), serif",
            }}
          >
            <Plus className="h-4 w-4" />
            Add your first client
          </button>
        </Card>

        {clientDrawer.open && (
          <ClientFormDrawer
            open
            onClose={() => setClientDrawer({ open: false })}
            mode={
              clientDrawer.mode === "edit"
                ? { kind: "edit", client: clientDrawer.client }
                : { kind: "create" }
            }
          />
        )}
      </div>
    );
  }

  // ─── Populated state ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${clients.length} active client${clients.length === 1 ? "" : "s"} · ${totalSites} site${totalSites === 1 ? "" : "s"}`}
        title="Clients & Sites"
        description="Master directory · contracts · service history"
        actions={
          <>
            <button
              type="button"
              onClick={() => toast.info("Export not implemented yet.")}
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3.5 py-2 text-[12px] font-medium tracking-wide hover:bg-muted/40"
              style={{
                borderColor: "var(--brand-border)",
                color: "var(--brand-text)",
              }}
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
            <button
              type="button"
              onClick={() => setClientDrawer({ open: true, mode: "create" })}
              className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[12px] font-medium tracking-wide text-white"
              style={{ background: "var(--brand-primary)" }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add client
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="lg:col-span-4 space-y-3">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder="Search clients…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <p className="nx-eyebrow-soft">
            A–Z · {filtered.length} of {clients.length}
          </p>

          <ul className="space-y-2">
            {filtered.map((c) => (
              <ClientRow
                key={c.id}
                client={c}
                active={c.id === activeId}
                onSelect={() => setActiveId(c.id)}
                onEdit={() =>
                  setClientDrawer({ open: true, mode: "edit", client: c })
                }
                onDelete={() => handleDeleteClient(c)}
              />
            ))}
          </ul>
        </div>

        <div className="lg:col-span-8 space-y-5">
          {selected && (
            <>
              <ClientHeader
                client={selected}
                sites={sitesByClient[selected.id] ?? []}
                onEdit={() =>
                  setClientDrawer({ open: true, mode: "edit", client: selected })
                }
                onAddSite={() =>
                  setSiteDrawer({
                    open: true,
                    mode: "create",
                    clientId: selected.id,
                  })
                }
              />
              <ClientStatsRow client={selected} />
              <TabBar
                tab={tab}
                onChange={setTab}
                sitesCount={(sitesByClient[selected.id] ?? []).length}
                contactsCount={(contactsByClient[selected.id] ?? []).length}
              />
              {tab === "Sites" && (
                <SitesPane
                  client={selected}
                  sites={sitesByClient[selected.id] ?? []}
                  contacts={contactsByClient[selected.id] ?? []}
                  onAddSite={() =>
                    setSiteDrawer({
                      open: true,
                      mode: "create",
                      clientId: selected.id,
                    })
                  }
                  onEditSite={(s) =>
                    setSiteDrawer({ open: true, mode: "edit", site: s })
                  }
                  onDeleteSite={handleDeleteSite}
                  onAddContact={() =>
                    setContactDrawer({
                      open: true,
                      mode: "create",
                      clientId: selected.id,
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
                  contacts={contactsByClient[selected.id] ?? []}
                  onAdd={() =>
                    setContactDrawer({
                      open: true,
                      mode: "create",
                      clientId: selected.id,
                    })
                  }
                  onEdit={(c) =>
                    setContactDrawer({ open: true, mode: "edit", contact: c })
                  }
                  onDelete={handleDeleteContact}
                />
              )}
              {tab === "Contracts" && <PlaceholderPane label="Contracts" />}
              {tab === "Service History" && <PlaceholderPane label="Service history" />}
              {tab === "Documents" && <PlaceholderPane label="Documents" />}
              {tab === "Activity" && <PlaceholderPane label="Activity" />}
            </>
          )}
        </div>
      </div>

      {clientDrawer.open && (
        <ClientFormDrawer
          open
          onClose={() => setClientDrawer({ open: false })}
          mode={
            clientDrawer.mode === "edit"
              ? { kind: "edit", client: clientDrawer.client }
              : { kind: "create" }
          }
        />
      )}
      {siteDrawer.open && (
        <SiteFormDrawer
          open
          onClose={() => setSiteDrawer({ open: false })}
          mode={
            siteDrawer.mode === "edit"
              ? { kind: "edit", site: siteDrawer.site }
              : { kind: "create", clientId: siteDrawer.clientId }
          }
        />
      )}
      {contactDrawer.open && (
        <ContactFormDrawer
          open
          onClose={() => setContactDrawer({ open: false })}
          sites={selected ? sitesByClient[selected.id] ?? [] : []}
          mode={
            contactDrawer.mode === "edit"
              ? { kind: "edit", contact: contactDrawer.contact }
              : { kind: "create", clientId: contactDrawer.clientId }
          }
        />
      )}
    </div>
  );

  // ─── Delete handlers ─────────────────────────────────────────────────────
  function handleDeleteClient(c: DbClient) {
    if (!confirm(`Soft-delete ${c.name}? It will be hidden from the list.`))
      return;
    deleteClientAction(c.id).then((r) => {
      if (r.ok) toast.success(`Deleted ${c.name}`);
      else toast.error(r.error);
    });
  }

  function handleDeleteSite(s: DbSite) {
    if (!confirm(`Soft-delete site "${s.name}"?`)) return;
    deleteSiteAction(s.id).then((r) => {
      if (r.ok) toast.success(`Deleted ${s.name}`);
      else toast.error(r.error);
    });
  }

  function handleDeleteContact(c: DbContact) {
    const fullName = `${c.first_name} ${c.last_name}`;
    if (!confirm(`Soft-delete ${fullName}?`)) return;
    deleteContactAction(c.id).then((r) => {
      if (r.ok) toast.success(`Deleted ${fullName}`);
      else toast.error(r.error);
    });
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ClientRow({
  client,
  active,
  onSelect,
  onEdit,
  onDelete,
}: {
  client: DbClientWithCounts;
  active: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tier = client.tier;
  const badge = tier ? TIER_BADGE[tier] : TIER_BADGE.Bronze;

  return (
    <li className="group">
      <div
        className={cn(
          "relative flex w-full items-center gap-3 rounded-md border bg-card p-3 transition-shadow",
          active ? "shadow-md ring-1" : "hover:shadow-sm"
        )}
        style={{
          borderColor: active
            ? "color-mix(in oklab, var(--brand-accent) 60%, transparent)"
            : "var(--brand-border)",
          ["--tw-ring-color" as string]: "var(--brand-accent)",
        }}
      >
        <button
          type="button"
          onClick={onSelect}
          className="flex flex-1 items-center gap-3 text-left"
        >
          <span
            className="flex h-9 w-9 items-center justify-center rounded-sm font-mono text-[10px] font-bold tracking-widest"
            style={{
              background: active ? "var(--brand-primary)" : "var(--brand-muted)",
              color: active ? "var(--brand-bg)" : "var(--brand-primary)",
            }}
          >
            {initials(client.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="font-serif text-sm font-medium leading-tight truncate"
              style={{ color: "var(--brand-primary)" }}
            >
              {client.name}
            </p>
            <p className="text-muted-foreground mt-0.5 truncate text-[11px]">
              {client.type ?? "—"} · {client.site_count} site
              {client.site_count === 1 ? "" : "s"} ·{" "}
              <span className="text-brand-charcoal font-medium">
                {formatCurrency(client.lifetime_value)}
              </span>
            </p>
          </div>
        </button>
        {tier && (
          <span
            className="flex h-6 w-6 items-center justify-center rounded-sm font-mono text-[10px] font-bold"
            style={{ background: badge.bg, color: badge.text }}
            title={tier}
          >
            {badge.label}
          </span>
        )}
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={onEdit}
            className="text-muted-foreground hover:bg-muted hover:text-brand-charcoal rounded p-1"
            aria-label="Edit"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-muted-foreground hover:bg-muted rounded p-1 hover:text-red-600"
            aria-label="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}

function ClientHeader({
  client,
  sites,
  onEdit,
  onAddSite,
}: {
  client: DbClientWithCounts;
  sites: DbSite[];
  onEdit: () => void;
  onAddSite: () => void;
}) {
  const tier = client.tier;
  const badge = tier ? TIER_BADGE[tier] : null;

  return (
    <Card
      className="p-6 shadow-sm"
      style={{
        background: "var(--brand-card)",
        borderColor: "var(--brand-border)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {badge && (
            <span
              className="flex h-14 w-14 items-center justify-center font-mono text-[16px] font-bold tracking-widest rounded-sm"
              style={{ background: badge.bg, color: badge.text }}
            >
              {initials(client.name)}
            </span>
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {tier && badge && (
                <span
                  className="rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest"
                  style={{ background: badge.bg, color: badge.text }}
                >
                  {tier}
                </span>
              )}
              {client.client_code && (
                <span
                  className="text-[10px] font-mono uppercase tracking-widest"
                  style={{ color: "var(--brand-accent-soft)" }}
                >
                  · ACCT {client.client_code}
                </span>
              )}
              <span
                className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest"
                style={{
                  color:
                    client.status === "Active"
                      ? "var(--brand-status-green)"
                      : "var(--brand-accent-soft)",
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background:
                      client.status === "Active"
                        ? "var(--brand-status-green)"
                        : "var(--brand-accent-soft)",
                  }}
                />
                {client.status.toUpperCase()}
              </span>
              <span
                className="text-[10px] font-mono uppercase tracking-widest"
                style={{ color: "var(--brand-accent-soft)" }}
              >
                · {sites.length} SITE{sites.length === 1 ? "" : "S"}
              </span>
            </div>
            <h2
              className="mt-1.5 font-serif text-3xl tracking-tight"
              style={{ color: "var(--brand-primary)" }}
            >
              {client.name}
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              {client.industry ?? client.type ?? "—"} · Client since{" "}
              {format(parseISO(client.created_at), "MMMM yyyy")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-[11px] font-medium hover:bg-muted/40"
            style={{
              borderColor: "var(--brand-border)",
              color: "var(--brand-text)",
            }}
          >
            <Edit3 className="h-3 w-3" />
            Edit
          </button>
          <button
            type="button"
            onClick={onAddSite}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium text-white"
            style={{ background: "var(--brand-primary)" }}
          >
            <Plus className="h-3 w-3" />
            New site
          </button>
        </div>
      </div>
    </Card>
  );
}

function ClientStatsRow({ client }: { client: DbClientWithCounts }) {
  const stats: Array<{ label: string; value: string; sub?: string }> = [
    {
      label: "Lifetime Value",
      value: formatCurrency(client.lifetime_value),
    },
    {
      label: "YTD Revenue",
      value: formatCurrency(client.ytd_revenue),
    },
    {
      label: "Open AR",
      value: "—",
      sub: "Wire invoicing module",
    },
    {
      label: "Active Sites",
      value: `${client.site_count}`,
    },
    {
      label: "NPS",
      value: client.nps_score != null ? `${client.nps_score}` : "—",
      sub: client.last_nps_date
        ? `Last survey ${format(parseISO(client.last_nps_date), "MMM d")}`
        : undefined,
    },
  ];

  return (
    <Card
      className="grid grid-cols-2 gap-4 p-5 shadow-sm md:grid-cols-5"
      style={{
        background: "var(--brand-card)",
        borderColor: "var(--brand-border)",
      }}
    >
      {stats.map((s) => (
        <div key={s.label}>
          <p className="nx-eyebrow-soft mb-1">{s.label}</p>
          <p
            className="font-serif text-xl tabular-nums"
            style={{ color: "var(--brand-primary)" }}
          >
            {s.value}
          </p>
          {s.sub && (
            <p className="text-muted-foreground mt-0.5 text-[10px]">{s.sub}</p>
          )}
        </div>
      ))}
    </Card>
  );
}

function TabBar({
  tab,
  onChange,
  sitesCount,
  contactsCount,
}: {
  tab: TabKey;
  onChange: (next: TabKey) => void;
  sitesCount: number;
  contactsCount: number;
}) {
  const counts: Partial<Record<TabKey, number>> = {
    Sites: sitesCount,
    Contacts: contactsCount,
  };
  return (
    <nav
      className="flex flex-wrap gap-1 border-b"
      style={{ borderColor: "var(--brand-border)" }}
    >
      {TABS.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className="relative px-3 py-2 text-[12px] font-medium transition-colors"
          style={{
            color:
              tab === t
                ? "var(--brand-primary)"
                : "color-mix(in oklab, var(--brand-text) 50%, transparent)",
          }}
        >
          {t}
          {counts[t] !== undefined && (
            <span
              className="ml-1 inline-block rounded-sm px-1 text-[10px] font-mono tabular-nums"
              style={{
                background:
                  tab === t ? "var(--brand-primary)" : "var(--brand-muted)",
                color: tab === t ? "var(--brand-bg)" : "var(--brand-text)",
              }}
            >
              {counts[t]}
            </span>
          )}
          {tab === t && (
            <span
              className="absolute bottom-[-1px] left-2 right-2 h-[2px]"
              style={{ background: "var(--brand-accent)" }}
            />
          )}
        </button>
      ))}
    </nav>
  );
}

function SitesPane({
  sites,
  contacts,
  onAddSite,
  onEditSite,
  onDeleteSite,
  onAddContact,
  onEditContact,
  onDeleteContact,
}: {
  client: DbClient;
  sites: DbSite[];
  contacts: DbContact[];
  onAddSite: () => void;
  onEditSite: (s: DbSite) => void;
  onDeleteSite: (s: DbSite) => void;
  onAddContact: () => void;
  onEditContact: (c: DbContact) => void;
  onDeleteContact: (c: DbContact) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-3">
        <div className="flex items-center justify-between">
          <p className="nx-eyebrow">Sites</p>
          <button
            type="button"
            onClick={onAddSite}
            className="inline-flex items-center gap-1 rounded-md border bg-card px-2.5 py-1 text-[10px] font-medium hover:bg-muted/40"
            style={{
              borderColor: "var(--brand-border)",
              color: "var(--brand-text)",
            }}
          >
            <Plus className="h-3 w-3" />
            Add site
          </button>
        </div>
        {sites.length === 0 ? (
          <Card
            className="border-dashed py-8 text-center"
            style={{ background: "var(--brand-card)" }}
          >
            <p className="text-muted-foreground text-xs">
              No sites yet. Add the first operating site for this client.
            </p>
          </Card>
        ) : (
          sites.map((s) => (
            <SiteCard
              key={s.id}
              site={s}
              onEdit={() => onEditSite(s)}
              onDelete={() => onDeleteSite(s)}
            />
          ))
        )}
      </div>
      <div className="space-y-4">
        <ContactsCard
          contacts={contacts}
          onAdd={onAddContact}
          onEdit={onEditContact}
          onDelete={onDeleteContact}
        />
      </div>
    </div>
  );
}

function SiteCard({
  site,
  onEdit,
  onDelete,
}: {
  site: DbSite;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card
      className="group p-4 shadow-sm"
      style={{
        background: "var(--brand-card)",
        borderColor: "var(--brand-border)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className="text-[11px] font-mono uppercase tracking-widest"
            style={{ color: "var(--brand-accent-soft)" }}
          >
            {[site.city, site.province].filter(Boolean).join(" · ") ||
              site.country}
          </p>
          <p
            className="text-brand-primary mt-0.5 text-sm font-semibold"
            style={{ color: "var(--brand-primary)" }}
          >
            {site.name}
          </p>
          {site.address_line1 && (
            <p className="text-muted-foreground mt-0.5 text-[11px]">
              {site.address_line1}
              {site.address_line2 ? ` · ${site.address_line2}` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded-sm px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider"
            style={{
              background:
                site.status === "Active"
                  ? "color-mix(in oklab, var(--brand-status-green) 18%, transparent)"
                  : "var(--brand-muted)",
              color:
                site.status === "Active"
                  ? "var(--brand-status-green)"
                  : "var(--brand-text)",
            }}
          >
            {site.status}
          </span>
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={onEdit}
              className="text-muted-foreground hover:bg-muted hover:text-brand-charcoal rounded p-1"
              aria-label="Edit site"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="text-muted-foreground hover:bg-muted rounded p-1 hover:text-red-600"
              aria-label="Delete site"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div
        className="mt-3 grid grid-cols-2 gap-3 rounded-md p-3 sm:grid-cols-4"
        style={{
          background:
            "color-mix(in oklab, var(--brand-muted) 50%, transparent)",
        }}
      >
        <SiteStat label="Panel" value={site.panel_system ?? "—"} />
        <SiteStat label="Intrusion" value={site.intrusion_system ?? "—"} />
        <SiteStat label="Cameras" value={`${site.cameras_count}`} />
        <SiteStat label="Controllers" value={`${site.controllers_count}`} />
        <SiteStat label="Doors" value={`${site.doors_count}`} />
        <SiteStat label="Cards Issued" value={`${site.cards_issued}`} />
        <SiteStat
          label="Last Service"
          value={
            site.last_service_date
              ? format(parseISO(site.last_service_date), "MMM d, yyyy")
              : "—"
          }
        />
        <SiteStat label="Country" value={site.country} />
      </div>
    </Card>
  );
}

function SiteStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <p className="nx-eyebrow-soft text-[9px] mb-0.5">{label}</p>
      <p className="text-brand-text text-[11px] font-medium leading-tight truncate">
        {value}
      </p>
      {sub && <p className="text-muted-foreground text-[10px]">{sub}</p>}
    </div>
  );
}

function ContactsCard({
  contacts,
  onAdd,
  onEdit,
  onDelete,
}: {
  contacts: DbContact[];
  onAdd: () => void;
  onEdit: (c: DbContact) => void;
  onDelete: (c: DbContact) => void;
}) {
  return (
    <Card
      className="p-4 shadow-sm"
      style={{
        background: "var(--brand-card)",
        borderColor: "var(--brand-border)",
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="nx-eyebrow">Primary contacts</p>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-0.5 text-[10px] font-medium hover:bg-muted/40"
          style={{
            borderColor: "var(--brand-border)",
            color: "var(--brand-text)",
          }}
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      </div>
      {contacts.length === 0 ? (
        <p className="text-muted-foreground py-3 text-center text-[11px]">
          No contacts yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {contacts.map((c) => (
            <li key={c.id} className="group flex items-center gap-2.5">
              <Avatar className="h-7 w-7">
                <AvatarFallback
                  className="text-[9px] font-semibold text-white"
                  style={{ background: "var(--brand-primary)" }}
                >
                  {initials(`${c.first_name} ${c.last_name}`)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-brand-text text-xs font-medium leading-tight truncate">
                  {c.first_name} {c.last_name}
                </p>
                <p className="text-muted-foreground text-[10px] leading-tight truncate">
                  {c.title ?? c.department ?? c.email ?? "—"}
                </p>
              </div>
              {c.email && <Mail className="text-muted-foreground h-3.5 w-3.5" />}
              <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => onEdit(c)}
                  className="text-muted-foreground hover:text-brand-charcoal p-0.5"
                  aria-label="Edit contact"
                >
                  <Edit3 className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(c)}
                  className="text-muted-foreground hover:text-red-600 p-0.5"
                  aria-label="Delete contact"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ContactsPane({
  contacts,
  onAdd,
  onEdit,
  onDelete,
}: {
  contacts: DbContact[];
  onAdd: () => void;
  onEdit: (c: DbContact) => void;
  onDelete: (c: DbContact) => void;
}) {
  if (contacts.length === 0) {
    return (
      <Card
        className="border-dashed py-12 text-center"
        style={{ background: "var(--brand-card)" }}
      >
        <p className="nx-eyebrow mb-2">Contacts</p>
        <p className="text-muted-foreground text-xs">
          No contacts yet for this client.
        </p>
        <button
          type="button"
          onClick={onAdd}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium text-white"
          style={{ background: "var(--brand-primary)" }}
        >
          <Plus className="h-3 w-3" />
          Add contact
        </button>
      </Card>
    );
  }
  return (
    <Card className="p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="nx-eyebrow">All contacts</p>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-0.5 text-[10px] font-medium hover:bg-muted/40"
          style={{
            borderColor: "var(--brand-border)",
            color: "var(--brand-text)",
          }}
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      </div>
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
                {c.is_primary && (
                  <span className="bg-brand-gold/15 ml-2 inline-block rounded-sm px-1 text-[9px] font-bold uppercase tracking-wider text-amber-800">
                    Primary
                  </span>
                )}
              </p>
              <p className="text-muted-foreground text-[11px]">
                {[c.title, c.department].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
            <div className="text-muted-foreground hidden gap-3 text-[11px] sm:flex">
              {c.email && (
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {c.email}
                </span>
              )}
              {c.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {c.phone}
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={() => onEdit(c)}
                className="text-muted-foreground hover:bg-muted hover:text-brand-charcoal rounded p-1"
                aria-label="Edit contact"
              >
                <Edit3 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(c)}
                className="text-muted-foreground hover:bg-muted rounded p-1 hover:text-red-600"
                aria-label="Delete contact"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PlaceholderPane({ label }: { label: string }) {
  return (
    <Card
      className="p-6 text-center shadow-sm"
      style={{
        background: "var(--brand-card)",
        borderColor: "var(--brand-border)",
      }}
    >
      <p className="text-muted-foreground text-xs">
        {label} will populate once the corresponding modules are wired to
        Supabase.
      </p>
    </Card>
  );
}
