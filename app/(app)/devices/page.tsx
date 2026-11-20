// DEVREG-1 — Device Register list route. Gated projects:view at the route (and
// again in every action). Filters come from the URL and are applied server-side.

import Link from "next/link";
import { can } from "@/lib/permissions/resolve";
import { listDevices, listFloorsForSite } from "@/lib/api/devices";
import { DevicesView } from "@/components/modules/devices/DevicesView";
import { Card } from "@/components/ui/card";
import { loadDeviceOptions } from "./options";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function DevicesPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await can("projects", "view"))) {
    return (
      <div className="mx-auto max-w-md py-16">
        <Card className="bg-card p-8 text-center shadow-sm">
          <h1 className="text-brand-navy font-serif text-2xl">Restricted</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            You don&rsquo;t have permission to view the device register.{" "}
            <Link href="/dashboard" className="text-brand-gold underline">
              Back to dashboard
            </Link>
          </p>
        </Card>
      </div>
    );
  }
  const sp = await searchParams;
  const siteId = one(sp.site);
  const [devices, options, siteFloors, canEdit] = await Promise.all([
    listDevices({
      siteId,
      projectId: one(sp.project),
      buildingKey: one(sp.building),
      floorId: one(sp.floor),
      typeId: one(sp.type),
      system: one(sp.system),
      search: one(sp.q),
    }),
    loadDeviceOptions(),
    siteId ? listFloorsForSite(siteId) : Promise.resolve(null),
    can("projects", "edit"),
  ]);
  const systems = [
    ...new Set([...options.types.map((t) => t.system), ...devices.map((d) => d.effective_system)].filter((s): s is string => !!s)),
  ].sort();

  return (
    <DevicesView
      devices={devices}
      sites={options.sites}
      projects={options.projects}
      floors={options.floors}
      siteFloors={siteFloors}
      types={options.types}
      systems={systems}
      canEdit={canEdit}
    />
  );
}
