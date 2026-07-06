// SITE-DETAIL — server component for the dedicated /sites/[id] detail page.
// Loads one site (joined with its parent-client slice) and hands off to the
// lean SiteDetailView. Kept intentionally minimal: header + parent-client link
// + the reusable attachments section (no full client-detail tab machinery).

import Link from "next/link";
import { notFound } from "next/navigation";
import { getSiteById, getContactsBySite } from "@/lib/api/clients";
import { listQuotesForSite } from "@/lib/api/quotes";
import { SiteDetailView } from "./SiteDetailView";
import { QuotesForEntitySection } from "@/components/modules/quotes/QuotesForEntitySection";
import { FolderTreeAttachments } from "@/components/modules/attachments/FolderTreeAttachments";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import type { DbRole } from "@/lib/types/database";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

// DbRole (11) → app Role (7); mirrors the projects/attachments action helpers.
function adaptRole(r: DbRole): Role {
  switch (r) {
    case "Admin":
    case "ProjectManager":
    case "SalesRep":
    case "Technician":
    case "Subcontractor":
    case "Accountant":
    case "ViewOnly":
      return r;
    case "LeadTechnician":
      return "Technician";
    case "Dispatcher":
      return "ProjectManager";
    case "Warehouse":
      return "Technician";
    case "ClientPortal":
      return "ViewOnly";
  }
}

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const site = await getSiteById(id);

  // POLISH-46 — archived (soft-deleted) sites are not browsable → 404.
  if (!site || site.deleted_at) {
    notFound();
  }

  // POLISH-50 — site-scoped contacts for the new Contacts section.
  // BUGFIX (quotes) A4 — read-only list of this site's quotes.
  const [contacts, me, quotes] = await Promise.all([
    getContactsBySite(id),
    getCurrentProfile(),
    listQuotesForSite(id),
  ]);
  const canEditFolders =
    !!me && hasPermission(adaptRole(me.role), "projects", "edit");

  return (
    <div className="space-y-4">
      <Link
        href="/sites"
        className="text-muted-foreground hover:text-brand-charcoal text-xs"
      >
        ← Back to Sites
      </Link>
      <SiteDetailView site={site} contacts={contacts} />
      <QuotesForEntitySection quotes={quotes} />
      {/* PROJ2-4b — folder tree (Site lens): all projects' trees for this site. */}
      <FolderTreeAttachments
        rootSiteId={site.id}
        lens="site"
        canEdit={canEditFolders}
      />
    </div>
  );
}
