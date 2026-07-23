"use client";

// SUB-1 — subcontractors list route. Gated at the route level by
// subcontractors:view (the action layer re-gates every call as well).

import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Can } from "@/lib/role-context";
import { SubcontractorsView } from "@/components/modules/subcontractors/SubcontractorsView";

export default function SubcontractorsPage() {
  return (
    <Can resource="subcontractors" action="view" fallback={<Restricted />}>
      <SubcontractorsView />
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
