// Server component — fetches one client + its sites + contacts, then hands
// off to the interactive ClientDetailView (client component).

import Link from "next/link";
import { getClientById } from "@/lib/api/clients";
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
    />
  );
}
