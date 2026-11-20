"use client";

// DEVREG-1 — the Device Register list. Filters live in the URL (site, project,
// building, floor, type, system, search) so a filtered view can be bookmarked and
// the server does the filtering. Search covers label, model and IP.

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/PageHeader";
import { displayLabel } from "@/lib/devices/identity";
import { DEVICE_SOURCE_LABEL, emptyDeviceFields, type DeviceSource } from "@/lib/devices/model";
import type { DeviceRow } from "@/lib/api/devices";
import { DeviceFormDrawer } from "./DeviceFormDrawer";
import { FloorsPanel, type FloorPanelRow } from "./FloorsPanel";
import { DOOR_GROUP_BADGE_CLS, FIELD_LABEL_CLS, SELECT_CLS, opcoText, show, type FloorOption, type ProjectOption, type SiteOption, type TypeOption } from "./shared";

export function DevicesView({
  devices,
  sites,
  projects,
  floors,
  siteFloors,
  types,
  systems,
  canEdit,
}: {
  devices: DeviceRow[];
  sites: SiteOption[];
  projects: ProjectOption[];
  floors: FloorOption[];
  /** Full floor rows for the selected site (floors panel), or null when no site is chosen. */
  siteFloors: FloorPanelRow[] | null;
  types: TypeOption[];
  systems: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState(params.get("q") ?? "");

  const siteId = params.get("site") ?? "";
  const setParam = (k: string, val: string) => {
    const next = new URLSearchParams(params.toString());
    if (val) next.set(k, val);
    else next.delete(k);
    if (k === "site") {
      next.delete("project");
      next.delete("building");
      next.delete("floor");
    }
    router.push(`/devices?${next.toString()}`);
  };

  const buildingOptions = [
    ...new Map(
      floors
        .filter((f) => !siteId || f.siteId === siteId)
        .filter((f) => f.buildingKey)
        .map((f) => [f.buildingKey as string, f.buildingName || (f.buildingKey as string)])
    ).entries(),
  ];
  const floorOptions = floors.filter((f) => !siteId || f.siteId === siteId);
  const projectOptions = projects.filter((p) => !siteId || p.siteId === siteId);
  const unmatched = devices.filter((d) => d.type_matched === false).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Phase 2 · foundation"
        title="Device Register"
        description="Every device installed at a site: where it is, what it is, and how it's connected."
        actions={
          canEdit ? (
            <div className="flex gap-2">
              <Link href={`/devices/import${siteId ? `?site=${siteId}` : ""}`}>
                <Button variant="outline">Import schedule</Button>
              </Link>
              <Button onClick={() => setFormOpen(true)}>Add device</Button>
            </div>
          ) : undefined
        }
      />

      <Card className="bg-card grid grid-cols-2 gap-3 p-4 shadow-sm md:grid-cols-4 lg:grid-cols-7">
        <div>
          <label className={FIELD_LABEL_CLS}>Site</label>
          <select className={SELECT_CLS} value={siteId} onChange={(e) => setParam("site", e.target.value)}>
            <option value="">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={FIELD_LABEL_CLS}>Project</label>
          <select className={SELECT_CLS} value={params.get("project") ?? ""} onChange={(e) => setParam("project", e.target.value)}>
            <option value="">All projects</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={FIELD_LABEL_CLS}>Building</label>
          <select className={SELECT_CLS} value={params.get("building") ?? ""} onChange={(e) => setParam("building", e.target.value)}>
            <option value="">All buildings</option>
            {buildingOptions.map(([k, n]) => (
              <option key={k} value={k}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={FIELD_LABEL_CLS}>Floor</label>
          <select className={SELECT_CLS} value={params.get("floor") ?? ""} onChange={(e) => setParam("floor", e.target.value)}>
            <option value="">All floors</option>
            {floorOptions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.buildingName ? `${f.buildingName} · ` : ""}
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={FIELD_LABEL_CLS}>Type</label>
          <select className={SELECT_CLS} value={params.get("type") ?? ""} onChange={(e) => setParam("type", e.target.value)}>
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.kind === "door_group" ? " (door group)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={FIELD_LABEL_CLS}>System</label>
          <select className={SELECT_CLS} value={params.get("system") ?? ""} onChange={(e) => setParam("system", e.target.value)}>
            <option value="">All systems</option>
            {systems.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setParam("q", search.trim());
          }}
        >
          <label className={FIELD_LABEL_CLS}>Search</label>
          <Input className="mt-1.5" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Label, model or IP" />
        </form>
      </Card>

      {unmatched > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {unmatched} device{unmatched === 1 ? "" : "s"} in this view {unmatched === 1 ? "has a type" : "have types"} that
          isn&rsquo;t in the type list. {unmatched === 1 ? "It's" : "They're"} shown as <strong>unmatched</strong>, with the
          type exactly as recorded.
        </p>
      )}

      <Card className="bg-card overflow-x-auto shadow-sm">
        {devices.length === 0 ? (
          <p className="text-muted-foreground p-8 text-center text-sm">
            No devices recorded{siteId ? " at this site" : ""} yet.
            {canEdit ? " Add one by hand or import a device schedule." : ""}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left">
                {["Device", "Type", "System", "Model", "Site", "Floor", "IP", "Opco", "Source"].map((h) => (
                  <th key={h} className="text-muted-foreground px-4 py-2 text-[11px] uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr
                  key={d.id}
                  className="hover:bg-muted cursor-pointer border-b border-[var(--border)] last:border-0"
                  onClick={() => router.push(`/devices/${d.id}`)}
                >
                  <td className="text-brand-navy px-4 py-2.5 font-medium">
                    {displayLabel(d.label, d.building_name ?? d.building_key) || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {d.type_id ? (
                      d.type_matched ? (
                        <span>
                          {d.type_name}
                          {d.type_kind === "door_group" && <span className={`ml-1 ${DOOR_GROUP_BADGE_CLS}`}>door group</span>}
                        </span>
                      ) : (
                        <span>
                          <span className="font-mono">{d.type_id}</span>{" "}
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900">unmatched</span>
                        </span>
                      )
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs">{show(d.effective_system)}</td>
                  <td className="px-4 py-2.5 text-xs">{show(d.model)}</td>
                  <td className="px-4 py-2.5 text-xs">{show(d.site_name)}</td>
                  <td className="px-4 py-2.5 text-xs">{show(d.floor_label ?? d.floor_key)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{show(d.network?.ip)}</td>
                  <td className="px-4 py-2.5 text-xs">{opcoText(d.opco)}</td>
                  <td className="text-muted-foreground px-4 py-2.5 text-[11px]">
                    {DEVICE_SOURCE_LABEL[d.source as DeviceSource] ?? d.source}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {siteFloors && (
        <FloorsPanel siteId={siteId} floors={siteFloors} canEdit={canEdit} />
      )}

      {formOpen && (
        <DeviceFormDrawer
          open={formOpen}
          onOpenChange={setFormOpen}
          initial={{ siteId, projectId: params.get("project"), fields: emptyDeviceFields() }}
          sites={sites}
          projects={projects}
          floors={floors}
          types={types}
        />
      )}
    </div>
  );
}
