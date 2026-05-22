// Server component — fetches clients, then hands off to the interactive
// ClientsView (client component) for the list + the add/edit client drawer.
// Per-client sites + contacts are no longer pre-fetched here — they load on
// demand on the /clients/[id] detail page (no N+1 fan-out on the list).

import { ClientsView } from "./ClientsView";
import { getClients } from "@/lib/api/clients";

// Always run fresh — server actions revalidate this path on mutation but a
// `force-dynamic` guard means we never accidentally serve stale data from
// the static cache after a deploy.
export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const clients = await getClients();
  return <ClientsView clients={clients} />;
}
