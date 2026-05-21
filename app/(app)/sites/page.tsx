// SITES-1 — server component for the dedicated /sites page. Fetches every
// site across all clients (joined with a thin client slice) plus the client
// list for the create-drawer picker, then hands off to the interactive view.

import { listClientsAction, listSitesAction } from "../clients/actions";
import { SitesView } from "./SitesView";

// Always run fresh — site mutations refresh the view client-side, and
// force-dynamic guards against serving a stale list after a deploy.
export const dynamic = "force-dynamic";

export default async function SitesPage() {
  const [sitesRes, clientsRes] = await Promise.all([
    listSitesAction(),
    listClientsAction(),
  ]);

  const initialSites = sitesRes.ok ? sitesRes.data : [];
  const clients = clientsRes.ok
    ? clientsRes.data.map((c) => ({
        id: c.id,
        name: c.name,
        client_code: c.client_code,
      }))
    : [];

  return <SitesView initialSites={initialSites} clients={clients} />;
}
