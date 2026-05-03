// Server component — fetches Supabase data, then hands off to the
// interactive ClientsView (client component) for render + drawers.

import { ClientsView } from "./ClientsView";
import {
  getClients,
  getContactsByClient,
  getSitesByClient,
} from "@/lib/api/clients";
import type {
  DbContact,
  DbSite,
} from "@/lib/types/database";

// Always run fresh — server actions revalidate this path on mutation but a
// `force-dynamic` guard means we never accidentally serve stale data from
// the static cache after a deploy.
export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const clients = await getClients();

  // Pre-fetch sites + contacts for every client so the detail panel can
  // switch instantly. Cost is bounded — each fetch is one indexed query.
  const sitesByClient: Record<string, DbSite[]> = {};
  const contactsByClient: Record<string, DbContact[]> = {};

  if (clients.length > 0) {
    const results = await Promise.all(
      clients.map(async (c) => {
        const [sites, contacts] = await Promise.all([
          getSitesByClient(c.id),
          getContactsByClient(c.id),
        ]);
        return { id: c.id, sites, contacts };
      })
    );
    for (const { id, sites, contacts } of results) {
      sitesByClient[id] = sites;
      contactsByClient[id] = contacts;
    }
  }

  return (
    <ClientsView
      clients={clients}
      sitesByClient={sitesByClient}
      contactsByClient={contactsByClient}
    />
  );
}
