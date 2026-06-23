"use client";

// SITE-DETAIL — lean client view for /sites/[id]: a header (site name, address,
// link to the parent client) plus the reusable attachments section mounted at
// entity_type=site with free-form Documents folders. Deliberately NOT a copy of
// the full client-detail tab machinery.

import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AttachmentsSection } from "@/components/modules/attachments/AttachmentsSection";
import { initials } from "@/app/(app)/clients/_components/shared";
import type { DbContact, DbSiteWithClient } from "@/lib/types/database";

// POLISH-50 — role label derived from the contact flags (mirrors the client
// ContactsPane RoleBadges): is_primary / is_accounts_payable / is_billing /
// is_emergency / contact_type_custom.
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

// POLISH-50 — read-only Contacts section for the site detail page. Mirrors the
// /clients/[id] ContactsPane visual pattern (avatar + name + role badges + email
// + phones). Read-only: site-contact CRUD is not exposed here.
function SiteContacts({ contacts }: { contacts: DbContact[] }) {
  return (
    <Card className="p-4 shadow-sm">
      <p className="nx-eyebrow mb-3">Contacts</p>
      {contacts.length === 0 ? (
        <p className="text-muted-foreground py-3 text-center text-xs">
          No contacts yet.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-2.5">
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
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function SiteDetailView({
  site,
  contacts,
}: {
  site: DbSiteWithClient;
  contacts: DbContact[];
}) {
  const address =
    [
      site.address_line1,
      site.address_line2,
      site.city,
      site.province,
      site.postal_code,
    ]
      .filter(Boolean)
      .join(", ") || "No address on file";

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          {site.site_code && (
            <span className="text-muted-foreground font-mono text-xs">
              {site.site_code}
            </span>
          )}
          <h1 className="font-serif text-2xl font-semibold text-brand-primary">
            {site.name}
          </h1>
        </div>
        <p className="text-muted-foreground text-sm">{address}</p>
        <p className="text-sm">
          <span className="text-muted-foreground">Client: </span>
          {site.client?.deleted_at ? (
            // POLISH-45 — parent client archived: NOT clickable (the detail page
            // 404s for archived clients). Plain muted/italic text with a marker.
            <span className="italic text-zinc-400">
              {site.client?.name ?? "—"} (deleted)
            </span>
          ) : (
            <Link
              href={`/clients/${site.client_id}`}
              className="text-brand-charcoal font-medium underline-offset-2 hover:underline"
            >
              {site.client?.name ?? "—"}
            </Link>
          )}
        </p>
      </header>

      <SiteContacts contacts={contacts} />

      <AttachmentsSection
        entityType="site"
        entityId={site.id}
        folders={["Documents"]}
        allowCustomFolders
        title="Documents"
      />
    </div>
  );
}
