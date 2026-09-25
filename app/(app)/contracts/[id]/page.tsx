// RECUR-1 — service contract detail. Gated clients:view; edit/generate need
// financials:edit (enforced in the actions + reflected in canManage).

import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import { adaptDbRole } from "@/lib/permissions/resolve";
import { getServiceContract } from "@/lib/api/service-contracts";
import { getClients, listSites } from "@/lib/api/clients";
import { ContractDetail } from "@/components/modules/contracts/ContractDetail";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getCurrentProfile();
  const role = me ? adaptDbRole(me.role) : null;
  if (!role || !hasPermission(role, "clients", "view")) {
    return (
      <div className="mx-auto max-w-md py-16">
        <Card className="bg-card p-8 text-center shadow-sm">
          <h1 className="text-brand-navy font-serif text-2xl">Restricted</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            You don&rsquo;t have permission to view this contract.
          </p>
        </Card>
      </div>
    );
  }

  const detail = await getServiceContract(id);
  if (!detail) {
    return (
      <div className="bg-card mx-auto max-w-md rounded-lg border border-[var(--border)] p-8 text-center shadow-sm">
        <h1 className="text-brand-navy font-serif text-2xl">Contract not found</h1>
        <Link href="/contracts" className="text-brand-gold mt-4 inline-block text-sm hover:underline">
          ← Back to Service Contracts
        </Link>
      </div>
    );
  }

  const canManage = hasPermission(role, "financials", "edit");
  const [clients, sites] = await Promise.all([getClients(), listSites()]);
  const clientOptions = clients.map((c) => ({
    id: c.id,
    name: c.name,
    defaultOpco: (c as { default_opco: string | null }).default_opco ?? null,
  }));
  const siteOptions = sites.map((s) => ({ id: s.id, name: s.name, clientId: s.client_id }));

  return (
    <ContractDetail
      detail={detail}
      canManage={canManage}
      clientOptions={clientOptions}
      siteOptions={siteOptions}
    />
  );
}
