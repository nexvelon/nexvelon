// SITE-DETAIL — server component for the dedicated /sites/[id] detail page.
// Loads one site (joined with its parent-client slice) and hands off to the
// lean SiteDetailView. Kept intentionally minimal: header + parent-client link
// + the reusable attachments section (no full client-detail tab machinery).

import Link from "next/link";
import { notFound } from "next/navigation";
import { getSiteById } from "@/lib/api/clients";
import { SiteDetailView } from "./SiteDetailView";

export const dynamic = "force-dynamic";

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

  return (
    <div className="space-y-4">
      <Link
        href="/sites"
        className="text-muted-foreground hover:text-brand-charcoal text-xs"
      >
        ← Back to Sites
      </Link>
      <SiteDetailView site={site} />
    </div>
  );
}
