import "server-only";

// DEVREG-1 — the pickers the device pages share (sites, projects, floors, types).
// Called only by pages that have already passed the projects:view gate.

import { listSites } from "@/lib/api/clients";
import { listProjects } from "@/lib/api/projects";
import { listAllFloors, listDeviceTypes } from "@/lib/api/devices";
import type { FloorOption, ProjectOption, SiteOption, TypeOption } from "@/components/modules/devices/shared";

export async function loadDeviceOptions(): Promise<{
  sites: SiteOption[];
  projects: ProjectOption[];
  floors: FloorOption[];
  types: TypeOption[];
}> {
  const [sites, projects, floors, types] = await Promise.all([listSites(), listProjects(), listAllFloors(), listDeviceTypes()]);
  return {
    sites: sites.map((s) => ({ id: s.id, name: s.name, clientName: s.client?.name ?? null })),
    projects: projects.map((p) => ({
      id: p.id,
      label: p.title ? `${p.project_number} · ${p.title}` : p.project_number,
      siteId: p.site_id,
    })),
    floors: floors.map((f) => ({
      id: f.id,
      siteId: f.site_id,
      label: f.label ?? f.floor_key ?? f.level_key ?? "Floor",
      buildingKey: f.building_key,
      buildingName: f.building_name,
      floorKey: f.floor_key,
    })),
    types: types.map((t) => ({ id: t.id, name: t.name, system: t.system, kind: t.kind })),
  };
}
