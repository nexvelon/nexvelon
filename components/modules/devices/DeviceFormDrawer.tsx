"use client";

// DEVREG-1 — add / edit a device by hand. Blank fields are saved as empty (null),
// never as a default (§2.8). Network fields are only shown when asked for: a door
// contact has none.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createDeviceAction, updateDeviceAction } from "@/app/(app)/devices/actions";
import { normalizeNetwork, type DeviceFields, type DeviceNetwork } from "@/lib/devices/model";
import { FIELD_LABEL_CLS, SELECT_CLS, type FloorOption, type ProjectOption, type SiteOption, type TypeOption } from "./shared";

export interface DeviceFormInitial {
  id?: string;
  siteId: string;
  projectId: string | null;
  fields: DeviceFields;
}

const toStr = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const toNum = (s: string): number | null => {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const toText = (s: string): string | null => (s.trim() === "" ? null : s.trim());

export function DeviceFormDrawer({
  open,
  onOpenChange,
  initial,
  sites,
  projects,
  floors,
  types,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: DeviceFormInitial | null;
  sites: SiteOption[];
  projects: ProjectOption[];
  floors: FloorOption[];
  types: TypeOption[];
}) {
  const router = useRouter();
  const editing = !!initial?.id;
  const f = initial?.fields;
  const [siteId, setSiteId] = useState(initial?.siteId ?? "");
  const [projectId, setProjectId] = useState(initial?.projectId ?? "");
  const [v, setV] = useState<Record<string, string>>(() => ({
    label: toStr(f?.label),
    type_id: toStr(f?.type_id),
    system: toStr(f?.system),
    model: toStr(f?.model),
    floor_id: toStr(f?.floor_id),
    building_key: toStr(f?.building_key),
    floor_key: toStr(f?.floor_key),
    pos_x_m: toStr(f?.pos_x_m),
    pos_z_m: toStr(f?.pos_z_m),
    pos_u: toStr(f?.pos_u),
    pos_v: toStr(f?.pos_v),
    rotation_deg: toStr(f?.rotation_deg),
    mount_height_m: toStr(f?.mount_height_m),
    cable_type: toStr(f?.cable_type),
    homes_to: toStr(f?.homes_to),
    door_group: toStr(f?.door_group),
    install_detail: toStr(f?.install_detail),
    notes: toStr(f?.notes),
  }));
  const net0 = f?.network ?? {};
  const [showNet, setShowNet] = useState(!!f?.network);
  const [net, setNet] = useState<Record<string, string>>(() => ({
    ip: toStr(net0.ip),
    mask: toStr(net0.mask),
    gw: toStr(net0.gw),
    vlan: toStr(net0.vlan),
    sw: toStr(net0.sw),
    swip: toStr(net0.swip),
    port: toStr(net0.port),
    mbps: toStr(net0.mbps),
    ch: toStr(net0.ch),
    nvr: (net0.nvr ?? []).join("; "),
    inj: toStr(net0.inj),
  }));
  const [saving, setSaving] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }));
  const setN = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setNet((p) => ({ ...p, [k]: e.target.value }));

  const siteFloors = floors.filter((x) => x.siteId === siteId);
  const siteProjects = projects.filter((p) => p.siteId === siteId);

  function onPickFloor(id: string) {
    const fl = floors.find((x) => x.id === id);
    setV((p) => ({
      ...p,
      floor_id: id,
      building_key: fl ? toStr(fl.buildingKey) : p.building_key,
      floor_key: fl ? toStr(fl.floorKey) : p.floor_key,
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const network: DeviceNetwork | null = showNet
        ? normalizeNetwork({
            ip: toText(net.ip),
            mask: toText(net.mask),
            gw: toText(net.gw),
            vlan: toText(net.vlan),
            sw: toText(net.sw),
            swip: toText(net.swip),
            port: toText(net.port),
            mbps: toNum(net.mbps),
            ch: toNum(net.ch),
            nvr: net.nvr.split(/[;|,]/).map((s) => s.trim()).filter(Boolean),
            inj: toText(net.inj),
          })
        : null;
      const fields: Partial<DeviceFields> = {
        label: toText(v.label),
        type_id: toText(v.type_id),
        system: toText(v.system),
        model: toText(v.model),
        floor_id: v.floor_id || null,
        building_key: toText(v.building_key),
        floor_key: toText(v.floor_key),
        pos_x_m: toNum(v.pos_x_m),
        pos_z_m: toNum(v.pos_z_m),
        pos_u: toNum(v.pos_u),
        pos_v: toNum(v.pos_v),
        rotation_deg: toNum(v.rotation_deg),
        mount_height_m: toNum(v.mount_height_m),
        cable_type: toText(v.cable_type),
        homes_to: toText(v.homes_to),
        door_group: toText(v.door_group),
        install_detail: toText(v.install_detail),
        notes: toText(v.notes),
        network,
      };
      const res = editing
        ? await updateDeviceAction(initial!.id!, { fields, projectId: projectId || null })
        : await createDeviceAction({ siteId, projectId: projectId || null, fields });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(editing ? "Device saved." : "Device added.");
      onOpenChange(false);
      if (!editing) router.push(`/devices/${res.data.id}`);
      else router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const field = (k: string, label: string, placeholder?: string) => (
    <div>
      <label className={FIELD_LABEL_CLS}>{label}</label>
      <Input className="mt-1.5" value={v[k]} onChange={set(k)} placeholder={placeholder} />
    </div>
  );
  const netField = (k: string, label: string, placeholder?: string) => (
    <div>
      <label className={FIELD_LABEL_CLS}>{label}</label>
      <Input className="mt-1.5" value={net[k]} onChange={setN(k)} placeholder={placeholder} />
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[560px] overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="font-serif text-2xl">{editing ? "Edit device" : "Add a device"}</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4 px-4 pb-10">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={FIELD_LABEL_CLS}>Site</label>
              <select
                className={SELECT_CLS}
                value={siteId}
                disabled={editing}
                onChange={(e) => {
                  setSiteId(e.target.value);
                  setProjectId("");
                  setV((p) => ({ ...p, floor_id: "" }));
                }}
              >
                <option value="">Choose a site…</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.clientName ? ` (${s.clientName})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={FIELD_LABEL_CLS}>Project (optional)</label>
              <select className={SELECT_CLS} value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!siteId}>
                <option value="">No project</option>
                {siteProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {field("label", "Label", "CAM-01")}
            <div>
              <label className={FIELD_LABEL_CLS}>Type</label>
              <Input className="mt-1.5" value={v.type_id} onChange={set("type_id")} list="device-type-ids" placeholder="Riser Studio type id" />
              <datalist id="device-type-ids">
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </datalist>
              {v.type_id && !types.some((t) => t.id === v.type_id) && (
                <p className="mt-1 text-[11px] text-amber-700">Not in the type list. It will be saved as written and shown as unmatched.</p>
              )}
            </div>
            {field("system", "System", "cctv, access, fire…")}
            {field("model", "Model / part number")}
          </div>

          <div>
            <label className={FIELD_LABEL_CLS}>Floor</label>
            <select className={SELECT_CLS} value={v.floor_id} onChange={(e) => onPickFloor(e.target.value)} disabled={!siteId}>
              <option value="">Not placed on a floor</option>
              {siteFloors.map((fl) => (
                <option key={fl.id} value={fl.id}>
                  {fl.buildingName ? `${fl.buildingName} · ` : ""}
                  {fl.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {field("pos_x_m", "X on floor (m)")}
            {field("pos_z_m", "Z on floor (m)")}
            {field("pos_u", "Plan position u (0–1)")}
            {field("pos_v", "Plan position v (0–1)")}
            {field("rotation_deg", "Rotation (°)")}
            {field("mount_height_m", "Mount height (m)")}
            {field("cable_type", "Cable type")}
            {field("homes_to", "Homes to")}
            {field("door_group", "Door group")}
            {field("install_detail", "Install detail ref")}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showNet} onChange={(e) => setShowNet(e.target.checked)} />
              This is a network device (IP, switch, recorders)
            </label>
          </div>
          {showNet && (
            <div className="grid grid-cols-2 gap-3 rounded-md border border-[var(--border)] p-3">
              {netField("ip", "IP address")}
              {netField("mask", "Subnet mask")}
              {netField("gw", "Gateway")}
              {netField("vlan", "VLAN")}
              {netField("sw", "Switch")}
              {netField("swip", "Switch IP")}
              {netField("port", "Switch port")}
              {netField("inj", "PoE injector")}
              {netField("mbps", "Bitrate (Mbps)")}
              {netField("ch", "Channels")}
              <div className="col-span-2">{netField("nvr", "Recorders (primary; secondary; tertiary)")}</div>
            </div>
          )}

          <div>
            <label className={FIELD_LABEL_CLS}>Notes</label>
            <textarea className={SELECT_CLS} rows={3} value={v.notes} onChange={set("notes")} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !siteId || !v.label.trim()}>
              {saving ? "Saving…" : editing ? "Save" : "Add device"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
