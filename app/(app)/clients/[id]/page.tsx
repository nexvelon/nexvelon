// Server component — fetches one client + its sites + contacts + activity
// log, then hands off to the interactive ClientDetailView (client
// component). ACT-1 added the activity-log fetch alongside existing data.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getClientById } from "@/lib/api/clients";
import { listActivityFor } from "@/lib/api/activity-log";
import { listQuotesForClient } from "@/lib/api/quotes";
import type { DbClientWithCounts } from "@/lib/types/database";
import { ClientDetailView } from "./ClientDetailView";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getClientById(id);

  if (!result) {
    return (
      <div className="space-y-4 p-8">
        <Link href="/clients" className="text-brand-text text-sm underline">
          ← Back to Clients
        </Link>
        <p className="text-muted-foreground">
          Client not found. They may have been deleted or you may not have
          access.
        </p>
      </div>
    );
  }

  const { client, sites, contacts } = result;

  // POLISH-45 — archived (soft-deleted) clients are not browsable. Return the
  // Next.js 404 page rather than rendering an archived record.
  if (client.deleted_at) notFound();

  // ACT-1: fetch activity-log entries for THIS client (entity_type='client'
  // only — site / contact log rows exist in the DB but aren't surfaced on
  // this tab; future /sites/[id] + /contacts/[id] pages will render their
  // own). Run alongside the existing fetches.
  const activityLog = await listActivityFor("client", id, 100);

  // BUGFIX (quotes) A4 — this client's quotes + a site_id → name map for the
  // Quotes tab's Site column (a client spans many sites).
  const quotes = await listQuotesForClient(id);
  const siteNameById: Record<string, string> = {};
  for (const s of sites) siteNameById[s.id] = s.name;

  // DbClientWithCounts = DbClient + site_count + contact_count. Every other
  // field (lifetime_value / ytd_revenue / nps_score) lives on DbClient itself,
  // so the spread produces a complete view-model.
  const clientWithCounts: DbClientWithCounts = {
    ...client,
    site_count: sites.length,
    contact_count: contacts.length,
  };

  return (
    <ClientDetailView
      client={clientWithCounts}
      sites={sites}
      contacts={contacts}
      activityLog={activityLog}
      quotes={quotes}
      siteNameById={siteNameById}
    />
  );
}
