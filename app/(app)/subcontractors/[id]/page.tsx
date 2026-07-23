"use client";

// SUB-1 — subcontractor detail route. Gated by subcontractors:view; the detail
// component's own actions gate edit/delete on subcontractors:edit/:delete.

import { use } from "react";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Can } from "@/lib/role-context";
import { SubcontractorDetail } from "@/components/modules/subcontractors/SubcontractorDetail";

export default function SubcontractorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Can resource="subcontractors" action="view" fallback={<Restricted />}>
      <SubcontractorDetail id={id} />
    </Can>
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
          Contact your administrator for access to subcontractors.
        </p>
      </Card>
    </div>
  );
}
