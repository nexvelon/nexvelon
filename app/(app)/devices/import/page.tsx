// DEVREG-1 — device-schedule import route. Importing writes devices, so the route
// needs projects:edit (the actions check it again).

import Link from "next/link";
import { can } from "@/lib/permissions/resolve";
import { DeviceImportView } from "@/components/modules/devices/DeviceImportView";
import { Card } from "@/components/ui/card";
import { loadDeviceOptions } from "../options";

export const dynamic = "force-dynamic";

export default async function DeviceImportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await can("projects", "edit"))) {
    return (
      <div className="mx-auto max-w-md py-16">
        <Card className="bg-card p-8 text-center shadow-sm">
          <h1 className="text-brand-navy font-serif text-2xl">Restricted</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            You don&rsquo;t have permission to import devices.{" "}
            <Link href="/devices" className="text-brand-gold underline">
              Back to the Device Register
            </Link>
          </p>
        </Card>
      </div>
    );
  }
  const sp = await searchParams;
  const site = Array.isArray(sp.site) ? sp.site[0] : sp.site;
  const options = await loadDeviceOptions();
  return <DeviceImportView sites={options.sites} projects={options.projects} initialSiteId={site ?? ""} />;
}
