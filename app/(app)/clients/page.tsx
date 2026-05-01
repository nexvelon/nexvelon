"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Download, Mail, Phone, Plus, Search, Star } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  CLIENT_TIER_BADGE,
  clientTier,
  clients,
} from "@/lib/mock-data/clients";
import { sites as ALL_SITES } from "@/lib/mock-data/sites";
import { projects } from "@/lib/mock-data/projects";
import { invoices } from "@/lib/mock-data/invoices";
import { users } from "@/lib/mock-data/users";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Client, Site } from "@/lib/types";

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

export default function ClientsPage() {
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string>("c-005"); // Ardent Pharma
  const [tab, setTab] = useState<TabKey>("Sites");

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.contactName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
    );
  }, [search]);

  const selected = clients.find((c) => c.id === activeId) ?? clients[0];
  const sitesCount = ALL_SITES.length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${clients.length} active clients · ${sitesCount} sites`}
        title="Clients & Sites"
        description="Master directory · contracts · service history"
        actions={
          <>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3.5 py-2 text-[12px] font-medium tracking-wide hover:bg-muted/40"
              style={{ borderColor: "var(--brand-border)", color: "var(--brand-text)" }}
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
            <button
              type="button"
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
              />
            ))}
          </ul>
        </div>

        <div className="lg:col-span-8 space-y-5">
          <ClientHeader client={selected} />
          <ClientStatsRow client={selected} />
          <TabBar
            tab={tab}
            onChange={setTab}
            sitesCount={ALL_SITES.filter((s) => s.clientId === selected.id).length}
          />
          {tab === "Sites" && <SitesPane client={selected} />}
          {tab === "Contacts" && <ContactsPane client={selected} />}
          {tab === "Contracts" && <ContractsPane client={selected} />}
          {tab === "Service History" && <HistoryPane client={selected} />}
          {tab === "Documents" && <DocumentsPane />}
          {tab === "Activity" && <ActivityPane client={selected} />}
        </div>
      </div>
    </div>
  );
}

function ClientRow({
  client,
  active,
  onSelect,
}: {
  client: Client;
  active: boolean;
  onSelect: () => void;
}) {
  const projectCount = projects.filter((p) => p.clientId === client.id).length;
  const tier = clientTier(client);
  const badge = CLIENT_TIER_BADGE[tier];

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex w-full items-center gap-3 rounded-md border bg-card p-3 text-left transition-shadow",
          active ? "shadow-md ring-1" : "hover:shadow-sm"
        )}
        style={{
          borderColor: active
            ? "color-mix(in oklab, var(--brand-accent) 60%, transparent)"
            : "var(--brand-border)",
          ["--tw-ring-color" as string]: "var(--brand-accent)",
        }}
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
            {client.type} · {projectCount} site{projectCount === 1 ? "" : "s"} ·{" "}
            <span className="text-brand-charcoal font-medium">
              {formatCurrency(client.totalRevenue)}
            </span>
          </p>
        </div>
        <span
          className="flex h-6 w-6 items-center justify-center rounded-sm font-mono text-[10px] font-bold"
          style={{ background: badge.bg, color: badge.text }}
          title={tier}
        >
          {badge.label}
        </span>
      </button>
    </li>
  );
}

function ClientHeader({ client }: { client: Client }) {
  const tier = clientTier(client);
  const tierBadge = CLIENT_TIER_BADGE[tier];
  const sites = ALL_SITES.filter((s) => s.clientId === client.id);
  const accountNumber = `MCP-${client.id.replace("c-", "00")}`;

  return (
    <Card
      className="p-6 shadow-sm"
      style={{ background: "var(--brand-card)", borderColor: "var(--brand-border)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span
            className="flex h-14 w-14 items-center justify-center font-mono text-[16px] font-bold tracking-widest rounded-sm"
            style={{ background: tierBadge.bg, color: tierBadge.text }}
          >
            {initials(client.name)}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest"
                style={{ background: tierBadge.bg, color: tierBadge.text }}
              >
                {tier}
              </span>
              <span
                className="text-[10px] font-mono uppercase tracking-widest"
                style={{ color: "var(--brand-accent-soft)" }}
              >
                · ACCT {accountNumber}
              </span>
              <span
                className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest"
                style={{ color: "var(--brand-status-green)" }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--brand-status-green)" }}
                />
                ACTIVE MSA
              </span>
              <span
                className="text-[10px] font-mono uppercase tracking-widest"
                style={{ color: "var(--brand-accent-soft)" }}
              >
                · {sites.length} SITES
              </span>
            </div>
            <h2
              className="mt-1.5 font-serif text-3xl tracking-tight"
              style={{ color: "var(--brand-primary)" }}
            >
              {client.name}
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              {client.type} · GMP-validated facilities · Client since{" "}
              {format(parseISO(client.createdAt), "MMMM yyyy")} · Account
              manager{" "}
              <span className="text-brand-charcoal font-medium">
                {client.contactName}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-[11px] font-medium hover:bg-muted/40"
            style={{ borderColor: "var(--brand-border)", color: "var(--brand-text)" }}
          >
            <Mail className="h-3 w-3" />
            Email
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-[11px] font-medium hover:bg-muted/40"
            style={{ borderColor: "var(--brand-border)", color: "var(--brand-text)" }}
          >
            <Phone className="h-3 w-3" />
            Call
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium text-white"
            style={{ background: "var(--brand-primary)" }}
          >
            <Plus className="h-3 w-3" />
            New project
          </button>
        </div>
      </div>
    </Card>
  );
}

function ClientStatsRow({ client }: { client: Client }) {
  const projectsForClient = projects.filter((p) => p.clientId === client.id);
  const activeProjects = projectsForClient.filter((p) =>
    ["In Progress", "Planning", "Scheduled", "Commissioning", "At Risk"].includes(
      p.status
    )
  ).length;
  const ytd = invoices
    .filter((i) => i.clientId === client.id && i.status === "Paid")
    .reduce((s, i) => s + i.total, 0);
  const openAR = invoices
    .filter(
      (i) =>
        i.clientId === client.id && (i.status === "Sent" || i.status === "Overdue")
    )
    .reduce((s, i) => s + i.total, 0);
  const backlog = projectsForClient
    .filter((p) =>
      ["In Progress", "Planning", "Scheduled", "Commissioning", "At Risk"].includes(
        p.status
      )
    )
    .reduce((s, p) => s + Math.max(0, p.budget - p.spent), 0);

  const stats: Array<{ label: string; value: string; sub?: string }> = [
    { label: "Lifetime Value", value: formatCurrency(client.totalRevenue) },
    { label: "YTD Revenue", value: formatCurrency(ytd), sub: "Avg 22 days" },
    { label: "Open AR", value: formatCurrency(openAR), sub: "Avg 22 days" },
    {
      label: "Active Projects",
      value: `${activeProjects}`,
      sub: backlog > 0 ? `${formatCurrency(backlog)} backlog` : "—",
    },
    { label: "NPS", value: "68", sub: "Last survey Mar 14" },
  ];

  return (
    <Card
      className="grid grid-cols-2 gap-4 p-5 shadow-sm md:grid-cols-5"
      style={{ background: "var(--brand-card)", borderColor: "var(--brand-border)" }}
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
}: {
  tab: TabKey;
  onChange: (next: TabKey) => void;
  sitesCount: number;
}) {
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
          {t === "Sites" && (
            <span
              className="ml-1 inline-block rounded-sm px-1 text-[10px] font-mono tabular-nums"
              style={{
                background: tab === t ? "var(--brand-primary)" : "var(--brand-muted)",
                color: tab === t ? "var(--brand-bg)" : "var(--brand-text)",
              }}
            >
              {sitesCount}
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

function SitesPane({ client }: { client: Client }) {
  const sites = ALL_SITES.filter((s) => s.clientId === client.id);
  if (sites.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        No sites on file for this client.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-3">
        {sites.map((s, idx) => (
          <SiteCard key={s.id} site={s} expanded={idx === 0} />
        ))}
      </div>
      <div className="space-y-4">
        <ContactsCard client={client} />
        <ContractsCard client={client} />
      </div>
    </div>
  );
}

function SiteCard({ site, expanded }: { site: Site; expanded?: boolean }) {
  const labelExtra = site.name.split("·")[1]?.trim() ?? "Primary";
  return (
    <Card
      className="p-4 shadow-sm"
      style={{ background: "var(--brand-card)", borderColor: "var(--brand-border)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p
            className="text-[11px] font-mono uppercase tracking-widest"
            style={{ color: "var(--brand-accent-soft)" }}
          >
            {site.city} · {labelExtra}
          </p>
          <p className="text-brand-primary mt-0.5 text-sm font-semibold">
            {site.address}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-[11px] font-mono uppercase">
            38 doors · 64 cams
          </span>
          <span
            className="rounded-sm px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider"
            style={{
              background:
                "color-mix(in oklab, var(--brand-status-green) 18%, transparent)",
              color: "var(--brand-status-green)",
            }}
          >
            {expanded ? "IN PROJECT" : "MAINTAINED"}
          </span>
        </div>
      </div>

      {expanded && (
        <div
          className="mt-4 grid grid-cols-2 gap-3 rounded-md p-3 sm:grid-cols-4"
          style={{
            background: "color-mix(in oklab, var(--brand-muted) 50%, transparent)",
          }}
        >
          <SiteStat label="Contract" value="MSA-2024-A" sub="GMP rider" />
          <SiteStat label="Last Service" value="Apr 22, 2026" />
          <SiteStat label="Site Lead" value="D. Okafor" />
          <SiteStat label="Panel System" value="Genetec Synergis · 4.3" />
          <SiteStat label="Cameras" value="64 × Avigilon H5A" />
          <SiteStat label="Controllers" value="11 × Kantech KT-400" />
          <SiteStat label="Intrusion" value="DSC PowerSeries Neo" />
          <SiteStat label="Cards Issued" value="486 · MIFARE DESFire" />
        </div>
      )}
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
      <p className="text-brand-text text-[11px] font-medium leading-tight">
        {value}
      </p>
      {sub && <p className="text-muted-foreground text-[10px]">{sub}</p>}
    </div>
  );
}

function ContactsCard({ client }: { client: Client }) {
  const facilityLead = users.find((u) => u.id === "u-010") ?? users[0];
  const compliance = users.find((u) => u.id === "u-011") ?? users[1];
  const engineering = users.find((u) => u.id === "u-012") ?? users[2];
  const contacts = [
    { name: client.contactName, title: "Director of Facilities", icon: Star },
    { name: facilityLead.name, title: "Director of Facilities" },
    { name: compliance.name, title: "Compliance · GMP" },
    { name: engineering.name, title: "Plant Engineering Lead" },
  ];
  return (
    <Card
      className="p-4 shadow-sm"
      style={{ background: "var(--brand-card)", borderColor: "var(--brand-border)" }}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="nx-eyebrow">Primary contacts</p>
        <span className="text-muted-foreground text-[11px]">
          {contacts.length} people
        </span>
      </div>
      <ul className="space-y-2">
        {contacts.map((c) => (
          <li key={c.name} className="flex items-center gap-2.5">
            <Avatar className="h-7 w-7">
              <AvatarFallback
                className="text-[9px] font-semibold text-white"
                style={{ background: "var(--brand-primary)" }}
              >
                {initials(c.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-brand-text text-xs font-medium leading-tight truncate">
                {c.name}
              </p>
              <p className="text-muted-foreground text-[10px] leading-tight truncate">
                {c.title}
              </p>
            </div>
            <Mail className="text-muted-foreground h-3.5 w-3.5" />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ContractsCard({ client }: { client: Client }) {
  void client;
  const contracts = [
    { id: "MSA-2024-A", scope: "Mar 2024 → Feb 2027 · CA", value: 2_400_000 },
    { id: "MSA-2024-B", scope: "Mar 2024 → Feb 2027 · US", value: 1_100_000 },
    { id: "MSA-2025-C", scope: "Jan 2025 → Dec 2027 · Service", value: 380_000 },
  ];
  return (
    <Card
      className="p-4 shadow-sm"
      style={{ background: "var(--brand-card)", borderColor: "var(--brand-border)" }}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="nx-eyebrow">Active contracts</p>
        <span className="text-muted-foreground text-[11px]">
          {contracts.length} agreements
        </span>
      </div>
      <ul className="space-y-2">
        {contracts.map((c) => (
          <li key={c.id} className="flex items-start gap-2 text-xs">
            <div className="min-w-0 flex-1">
              <p className="text-brand-primary font-mono text-[11px] font-semibold">
                {c.id}
              </p>
              <p className="text-muted-foreground text-[10px]">{c.scope}</p>
            </div>
            <span className="text-brand-text font-serif text-[13px] tabular-nums">
              {formatCurrency(c.value)}{" "}
              <span className="text-muted-foreground text-[9px]">/ yr</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ContactsPane({ client }: { client: Client }) {
  return <ContactsCard client={client} />;
}

function ContractsPane({ client }: { client: Client }) {
  return <ContractsCard client={client} />;
}

function HistoryPane({ client }: { client: Client }) {
  const projectsForClient = projects.filter((p) => p.clientId === client.id);
  return (
    <Card className="p-4 shadow-sm">
      <p className="nx-eyebrow mb-3">Service history</p>
      <ul className="divide-y divide-[var(--border)]">
        {projectsForClient.length === 0 && (
          <li className="text-muted-foreground py-4 text-center text-xs">
            No service history on file.
          </li>
        )}
        {projectsForClient.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between py-2 text-xs"
          >
            <div>
              <p className="text-brand-text font-medium">{p.name}</p>
              <p className="text-muted-foreground text-[10px]">
                {format(parseISO(p.startDate), "MMM yyyy")} →{" "}
                {format(parseISO(p.targetDate), "MMM yyyy")}
              </p>
            </div>
            <span className="text-brand-primary tabular-nums font-serif text-[13px]">
              {formatCurrency(p.budget)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DocumentsPane() {
  return (
    <Card className="p-6 text-center shadow-sm">
      <p className="text-muted-foreground text-xs">
        Documents are linked from the project Documents tab. Master client-level
        agreements live in the Contracts tab.
      </p>
    </Card>
  );
}

function ActivityPane({ client }: { client: Client }) {
  const recent = invoices.filter((i) => i.clientId === client.id).slice(0, 6);
  return (
    <Card className="p-4 shadow-sm">
      <p className="nx-eyebrow mb-3">Recent activity</p>
      <ul className="space-y-2 text-xs">
        {recent.map((i) => (
          <li key={i.id} className="flex items-center justify-between">
            <span>
              <span className="text-brand-primary font-mono">{i.number}</span> ·{" "}
              <span className="text-muted-foreground">{i.status}</span>
            </span>
            <span className="text-brand-text tabular-nums">
              {formatCurrency(i.total)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
