"use client";

import { format, parseISO } from "date-fns";
import { Edit3, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { DbClient, DbContact, DbSite } from "@/lib/types/database";
import { ContactsCard } from "./ContactsPane";

export function SitesPane({
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
