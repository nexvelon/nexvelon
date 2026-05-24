// SITES-2b — Server component entry for the full-screen site-creation page.
// (app)/layout.tsx already gates the route group on an authenticated session,
// so we don't re-check here. Mirrors the /clients/new and /quotes/new
// precedents: RSC wrapper → "use client" view.
//
// Fetches the full client list (with billing/payment/portal columns) so the
// page can render the picker AND drive the inheritance display. If
// ?clientId=X is in the URL, the picker is hidden and that client is
// preselected — used by the "Add site" buttons on /clients/[id].

import { listClientsAction } from "../../clients/actions";
import { NewSitePageClient } from "./NewSitePageClient";

export const dynamic = "force-dynamic";

export default async function NewSitePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId } = await searchParams;
  const clientsRes = await listClientsAction();
  // listClientsAction returns DbClientWithCounts[] — a superset of DbClient
  // including site_count/contact_count we don't need. The form ignores the
  // counts and uses the billing/payment fields.
  const clients = clientsRes.ok ? clientsRes.data : [];

  return (
    <NewSitePageClient
      clients={clients}
      preselectedClientId={clientId ?? null}
    />
  );
}
