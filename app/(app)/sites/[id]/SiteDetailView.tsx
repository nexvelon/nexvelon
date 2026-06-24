"use client";

// SITE-DETAIL — lean client view for /sites/[id]: a header (site name, address,
// link to the parent client) plus the reusable attachments section mounted at
// entity_type=site with free-form Documents folders. Deliberately NOT a copy of
// the full client-detail tab machinery.

import Link from "next/link";
import { AttachmentsSection } from "@/components/modules/attachments/AttachmentsSection";
import { SiteContactsPane } from "@/app/(app)/clients/_components/SiteContactsPane";
import type { DbContact, DbSiteWithClient } from "@/lib/types/database";

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

      <SiteContactsPane siteId={site.id} contacts={contacts} />

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
