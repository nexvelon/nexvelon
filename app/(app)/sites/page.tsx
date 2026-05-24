// SITES-1 — server component for the dedicated /sites page. Fetches every
// site across all clients (joined with a thin client slice) plus the full
// client list (SITES-2b: full DbClient rows, not just id/name/code — the
// edit drawer needs the parent client's billing/payment/portal fields to
// render inheritance), then hands off to the interactive view.

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
  // listClientsAction returns DbClientWithCounts[] — a superset of DbClient
  // including site_count/contact_count. SitesView types `clients` as
  // DbClient[]; the structural-typing cascade handles the extra fields.
  const clients = clientsRes.ok ? clientsRes.data : [];

  return <SitesView initialSites={initialSites} clients={clients} />;
}
