"use client";

// DEVREG-1 — one device: everything it holds, where it came from, its position in
// both frames (computed only when the floor's scale is known), its network block,
// and the verbatim design / as-built source records.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { displayLabel } from "@/lib/devices/identity";
import { DEVICE_SOURCE_LABEL, type DeviceFields, type DeviceSource } from "@/lib/devices/model";
import { describePosition, CONVERSION_REFUSAL_LABEL } from "@/lib/devices/position";
import { removeDeviceAction } from "@/app/(app)/devices/actions";
import type { DeviceDetail } from "@/lib/api/devices";
import { DeviceFormDrawer } from "./DeviceFormDrawer";
import { FIELD_LABEL_CLS, fmtNum, opcoText, show, type FloorOption, type ProjectOption, type SiteOption, type TypeOption } from "./shared";

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[var(--border)] py-1.5 last:border-0">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`text-right text-sm ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

export function DeviceDetailView({
  detail,
  canEdit,
  canDelete,
  sites,
  projects,
  floors,
  types,
}: {
  detail: DeviceDetail;
  canEdit: boolean;
  canDelete: boolean;
  sites: SiteOption[];
  projects: ProjectOption[];
  floors: FloorOption[];
  types: TypeOption[];
}) {
  const router = useRouter();
  const { device: d, floor, type } = detail;
  const [editOpen, setEditOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const pos = describePosition(d, floor);
  const net = d.network;

  async function remove() {
    if (!confirm(`Remove ${d.label ?? "this device"} from the register? Its history is kept.`)) return;
    setRemoving(true);
    const res = await removeDeviceAction(d.id);
    setRemoving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Device removed.");
    router.push(`/devices?site=${d.site_id}`);
  }

  const fields: DeviceFields = d;

  return (
    <div className="space-y-6">
      <Link href={`/devices?site=${d.site_id}`} className="text-muted-foreground hover:text-brand-charcoal text-xs">
        ← Device Register
      </Link>
      <PageHeader
        eyebrow={d.site_name ?? undefined}
        title={displayLabel(d.label, d.building_name ?? d.building_key) || "Unlabelled device"}
        description={d.type_matched ? d.type_name ?? undefined : d.type_id ? `Type ${d.type_id} (unmatched)` : "No type recorded"}
        actions={
          <div className="flex gap-2">
            {canDelete && (
              <Button variant="outline" onClick={remove} disabled={removing}>
                Remove
              </Button>
            )}
            {canEdit && <Button onClick={() => setEditOpen(true)}>Edit</Button>}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-card p-4 shadow-sm">
          <h2 className="text-brand-navy mb-2 font-serif text-lg">Device</h2>
          <Row label="Label" value={show(d.label)} />
          <Row
            label="Type"
            value={
              d.type_id ? (
                d.type_matched ? (
                  `${d.type_name} (${d.type_id})`
                ) : (
                  <span>
                    <span className="font-mono">{d.type_id}</span>{" "}
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900">unmatched</span>
                  </span>
                )
              ) : (
                "—"
              )
            }
          />
          <Row label="System" value={show(d.effective_system)} />
          <Row label="Model / part number" value={show(d.model)} />
          <Row label="Mount height" value={d.mount_height_m != null ? `${fmtNum(d.mount_height_m)} m` : "—"} />
          <Row label="Rotation" value={d.rotation_deg != null ? `${fmtNum(d.rotation_deg, 1)}°` : "—"} />
          <Row label="Cable type" value={show(d.cable_type)} />
          <Row label="Homes to" value={show(d.homes_to)} />
          <Row label="Door group" value={show(d.door_group)} />
          <Row label="Install detail" value={show(d.install_detail)} />
          <Row label="Notes" value={show(d.notes)} />
          {type && (
            <p className="text-muted-foreground mt-3 text-[11px]">
              Type defaults: mount {type.default_mount_height_m != null ? `${type.default_mount_height_m} m` : "—"}, cable{" "}
              {show(type.default_cable_type)}, homes to {show(type.homes_to)}.
            </p>
          )}
        </Card>

        <Card className="bg-card p-4 shadow-sm">
          <h2 className="text-brand-navy mb-2 font-serif text-lg">Where it is</h2>
          <Row label="Site" value={<Link className="text-brand-gold hover:underline" href={`/sites/${d.site_id}`}>{show(d.site_name)}</Link>} />
          <Row label="Client" value={show(d.client_name)} />
          <Row
            label="Project"
            value={d.project_id ? <Link className="text-brand-gold hover:underline" href={`/projects/${d.project_id}`}>{show(d.project_number)}</Link> : "—"}
          />
          <Row label="Opco" value={opcoText(d.opco)} />
          <Row label="Building" value={show(d.building_name ?? d.building_key)} />
          <Row label="Floor" value={show(d.floor_label ?? d.floor_key)} />
          <Row
            label="Position on floor"
            value={
              pos.metres
                ? `x ${fmtNum(pos.metres.x)} m, z ${fmtNum(pos.metres.z)} m${pos.metres.derived ? " (from the plan scale)" : ""}`
                : "—"
            }
          />
          <Row
            label="Position on plan"
            value={
              pos.normalised
                ? `u ${fmtNum(pos.normalised.u, 4)}, v ${fmtNum(pos.normalised.v, 4)}${pos.normalised.derived ? " (from the plan scale)" : ""}`
                : "—"
            }
          />
          {pos.refusal && <p className="mt-2 text-[11px] text-amber-700">{CONVERSION_REFUSAL_LABEL[pos.refusal]}</p>}
          {d.route && <Row label="Conduit route" value={`${d.route.length} points`} />}
        </Card>

        <Card className="bg-card p-4 shadow-sm">
          <h2 className="text-brand-navy mb-2 font-serif text-lg">Network</h2>
          {!net ? (
            <p className="text-muted-foreground text-sm">No network details. Not every device has them (a door contact doesn&rsquo;t).</p>
          ) : (
            <>
              <Row label="IP address" value={show(net.ip)} mono />
              <Row label="Subnet mask" value={show(net.mask)} mono />
              <Row label="Gateway" value={show(net.gw)} mono />
              <Row label="VLAN" value={show(net.vlan)} />
              <Row label="Switch" value={show(net.sw)} />
              <Row label="Switch IP" value={show(net.swip)} mono />
              <Row label="Switch port" value={show(net.port)} />
              <Row label="Recorders" value={show(net.nvr)} />
              <Row label="Bitrate" value={net.mbps != null ? `${net.mbps} Mbps` : "—"} />
              <Row label="Channels" value={show(net.ch)} />
              <Row label="PoE injector" value={show(net.inj)} />
            </>
          )}
        </Card>

        <Card className="bg-card p-4 shadow-sm">
          <h2 className="text-brand-navy mb-2 font-serif text-lg">Where this record came from</h2>
          <Row label="Source" value={DEVICE_SOURCE_LABEL[d.source as DeviceSource] ?? d.source} />
          <Row label="Source device id" value={show(d.external_id)} mono />
          <Row label="Added" value={new Date(d.created_at).toLocaleString()} />
          <Row label="Last changed" value={new Date(d.updated_at).toLocaleString()} />
          <div className="mt-3 space-y-2">
            <details>
              <summary className={`${FIELD_LABEL_CLS} cursor-pointer`}>As designed (Riser Studio record)</summary>
              {d.design ? (
                <pre className="bg-muted mt-2 overflow-x-auto rounded p-2 text-[11px]">{JSON.stringify(d.design, null, 2)}</pre>
              ) : (
                <p className="text-muted-foreground mt-1 text-xs">No design record.</p>
              )}
            </details>
            <details>
              <summary className={`${FIELD_LABEL_CLS} cursor-pointer`}>As built (3D System Design View record)</summary>
              {d.as_built ? (
                <pre className="bg-muted mt-2 overflow-x-auto rounded p-2 text-[11px]">{JSON.stringify(d.as_built, null, 2)}</pre>
              ) : (
                <p className="text-muted-foreground mt-1 text-xs">No as-built record.</p>
              )}
            </details>
          </div>
        </Card>
      </div>

      {editOpen && (
        <DeviceFormDrawer
          open={editOpen}
          onOpenChange={setEditOpen}
          initial={{ id: d.id, siteId: d.site_id, projectId: d.project_id, fields }}
          sites={sites}
          projects={projects}
          floors={floors}
          types={types}
        />
      )}
    </div>
  );
}
