// RECUR-1 — service contracts list route. Gated clients:view (contracts are
// client/site commercial records). MRR + pending drafts are financial views, shown
// only to financials:view. Fetches the client + site pickers the create/edit form
// needs.

import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import { adaptDbRole } from "@/lib/permissions/resolve";
import { getClients, listSites } from "@/lib/api/clients";
import {
  listServiceContracts,
  getRecurringRevenue,
  listPendingContractDrafts,
} from "@/lib/api/service-contracts";
import { ContractsView } from "@/components/modules/contracts/ContractsView";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function ContractsPage() {
  const me = await getCurrentProfile();
  const role = me ? adaptDbRole(me.role) : null;
  const canView = !!role && hasPermission(role, "clients", "view");
  if (!canView) {
    return (
      <div className="mx-auto max-w-md py-16">
        <Card className="bg-card p-8 text-center shadow-sm">
          <h1 className="text-brand-navy font-serif text-2xl">Restricted</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            You don&rsquo;t have permission to view service contracts.{" "}
            <Link href="/dashboard" className="text-brand-gold underline">
              Back to dashboard
            </Link>
          </p>
        </Card>
      </div>
    );
  }

  const canManage = hasPermission(role, "financials", "edit");
  const canViewFinancials = hasPermission(role, "financials", "view");

  const [contracts, clients, sites, revenue, pending] = await Promise.all([
    listServiceContracts(),
    getClients(),
    listSites(),
    canViewFinancials ? getRecurringRevenue() : Promise.resolve(null),
    canViewFinancials ? listPendingContractDrafts() : Promise.resolve([]),
  ]);

  const clientOptions = clients.map((c) => ({
    id: c.id,
    name: c.name,
    defaultOpco: (c as { default_opco: string | null }).default_opco ?? null,
  }));
  const siteOptions = sites.map((s) => ({ id: s.id, name: s.name, clientId: s.client_id }));

  return (
    <ContractsView
      contracts={contracts}
      clientOptions={clientOptions}
      siteOptions={siteOptions}
      revenue={revenue}
      pendingDrafts={pending}
      canManage={canManage}
      canViewFinancials={canViewFinancials}
    />
  );
}
