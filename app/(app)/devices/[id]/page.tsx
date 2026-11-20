// DEVREG-1 — device detail. Gated projects:view; edit needs projects:edit and
// remove projects:delete (enforced in the actions, reflected in the buttons).

import Link from "next/link";
import { can } from "@/lib/permissions/resolve";
import { getDevice } from "@/lib/api/devices";
import { DeviceDetailView } from "@/components/modules/devices/DeviceDetailView";
import { Card } from "@/components/ui/card";
import { loadDeviceOptions } from "../options";

export const dynamic = "force-dynamic";

export default async function DeviceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await can("projects", "view"))) {
    return (
      <div className="mx-auto max-w-md py-16">
        <Card className="bg-card p-8 text-center shadow-sm">
          <h1 className="text-brand-navy font-serif text-2xl">Restricted</h1>
          <p className="text-muted-foreground mt-2 text-sm">You don&rsquo;t have permission to view this device.</p>
        </Card>
      </div>
    );
  }
  const detail = await getDevice(id);
  if (!detail || detail.device.deleted_at) {
    return (
      <div className="bg-card mx-auto max-w-md rounded-lg border border-[var(--border)] p-8 text-center shadow-sm">
        <h1 className="text-brand-navy font-serif text-2xl">Device not found</h1>
        <p className="text-muted-foreground mt-2 text-sm">It may have been removed. Its history is still in the activity log.</p>
        <Link href="/devices" className="text-brand-gold mt-4 inline-block text-sm hover:underline">
          ← Back to the Device Register
        </Link>
      </div>
    );
  }
  const [options, canEdit, canDelete] = await Promise.all([loadDeviceOptions(), can("projects", "edit"), can("projects", "delete")]);
  return (
    <DeviceDetailView
      detail={detail}
      canEdit={canEdit}
      canDelete={canDelete}
      sites={options.sites}
      projects={options.projects}
      floors={options.floors}
      types={options.types}
    />
  );
}
