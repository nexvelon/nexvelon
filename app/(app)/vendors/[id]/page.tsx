// INV-9-1 — vendor detail route. Vendors were a list + edit-drawer with no
// detail page (unlike subcontractors); this adds one so the Performance summary
// has somewhere to live. Gate + spend redaction come from getVendorMetricsAction
// (inventory:view to read; financials:view to see spend). Missing vendor → 404.

import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getVendorById } from "@/lib/api/vendors";
import { getVendorMetricYears } from "@/lib/api/vendor-metrics";
import { getVendorMetricsAction } from "@/app/(app)/vendors/actions";
import { VendorDetailView } from "@/components/modules/vendors/VendorDetailView";

export const dynamic = "force-dynamic";

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const vendor = await getVendorById(id);
  if (!vendor) notFound();

  const year = new Date().getFullYear();
  const res = await getVendorMetricsAction(id, year);
  if (!res.ok) return <Restricted />;

  const years = await getVendorMetricYears(id);
  return (
    <VendorDetailView
      vendor={vendor}
      initialMetrics={res.data.metrics}
      initialCanSeeSpend={res.data.canSeeSpend}
      years={years}
      initialYear={year}
    />
  );
}

function Restricted() {
  return (
    <div className="mx-auto max-w-md py-16">
      <Card className="bg-card border-t-2 border-t-[#C9A24B] p-8 text-center shadow-sm">
        <div className="bg-brand-charcoal/5 text-brand-charcoal/50 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
          <Lock className="h-5 w-5" />
        </div>
        <h1 className="text-brand-navy font-serif text-2xl">Restricted Access</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Contact your administrator for access to vendors.
        </p>
      </Card>
    </div>
  );
}
