// PO-1 — server component: fetches vendors, then hands off to the interactive
// VendorsView (list + add/edit drawer). Mirrors app/(app)/clients/page.tsx.

import { VendorsView } from "@/components/modules/vendors/VendorsView";
import { getVendors } from "@/lib/api/vendors";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  const vendors = await getVendors();
  return <VendorsView vendors={vendors} />;
}
