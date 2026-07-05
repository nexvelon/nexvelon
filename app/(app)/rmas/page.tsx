// INV-4 — RMA list route. (app)/layout.tsx already gates the route group on an
// authenticated session. RSC-fetches the RMA list + vendors (for the create
// dialog) and hands off to the client view.

import { listRmas } from "@/lib/api/rmas";
import { getVendors } from "@/lib/api/vendors";
import { RmaListView } from "@/components/modules/rmas/RmaListView";

export const dynamic = "force-dynamic";

export default async function RmasPage() {
  const [rmas, vendors] = await Promise.all([listRmas(), getVendors()]);
  return <RmaListView rmas={rmas} vendors={vendors} />;
}
