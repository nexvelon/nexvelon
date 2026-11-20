"use client";

// DEVREG-1 — the floors of one site, and the plan scale that converts a device's
// position between metres and plan coordinates. Every scale value is optional and
// stays blank until someone knows it: a blank scale means conversion is refused,
// never guessed (2C).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveFloorAction } from "@/app/(app)/devices/actions";
import { aspectMismatch, floorScaleStatus, CONVERSION_REFUSAL_LABEL, type FloorScale } from "@/lib/devices/position";
import { FIELD_LABEL_CLS, fmtNum, show } from "./shared";

export interface FloorPanelRow extends FloorScale {
  id: string;
  building_key: string | null;
  building_name: string | null;
  floor_key: string | null;
  level_key: string | null;
  label: string | null;
  sort_order: number;
  floor_height_m: number | null;
}

const KEYS = [
  ["label", "Floor name"],
  ["building_name", "Building name"],
  ["building_key", "Building key (Riser `b`)"],
  ["floor_key", "Floor key (Riser `f`)"],
  ["level_key", "Level key (3D viewer `lvl`)"],
  ["floor_height_m", "Floor height (m)"],
  ["plan_aspect", "Plan image aspect (w ÷ h)"],
  ["plan_origin_x_m", "Plan top-left X (m)"],
  ["plan_origin_z_m", "Plan top-left Z (m)"],
  ["plan_width_m", "Plan real width (m)"],
  ["plan_depth_m", "Plan real depth (m)"],
] as const;
const NUMERIC = new Set(["floor_height_m", "plan_aspect", "plan_origin_x_m", "plan_origin_z_m", "plan_width_m", "plan_depth_m"]);

function blank(): Record<string, string> {
  return Object.fromEntries(KEYS.map(([k]) => [k, ""]));
}

export function FloorsPanel({ siteId, floors, canEdit }: { siteId: string; floors: FloorPanelRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [v, setV] = useState<Record<string, string>>(blank());
  const [saving, setSaving] = useState(false);

  function open(f: FloorPanelRow | null) {
    if (!f) {
      setV(blank());
      setEditing("new");
      return;
    }
    setV(Object.fromEntries(KEYS.map(([k]) => [k, f[k] == null ? "" : String(f[k])])));
    setEditing(f.id);
  }

  async function save() {
    setSaving(true);
    try {
      const floor: Record<string, unknown> = {};
      for (const [k] of KEYS) {
        const s = v[k].trim();
        floor[k] = s === "" ? null : NUMERIC.has(k) ? Number(s) : s;
        if (NUMERIC.has(k) && s !== "" && !Number.isFinite(Number(s))) {
          toast.error(`${k} must be a number.`);
          return;
        }
      }
      const res = await saveFloorAction({ id: editing && editing !== "new" ? editing : undefined, siteId, floor });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Floor saved.");
      setEditing(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="bg-card space-y-3 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-brand-navy font-serif text-lg">Floors on this site</h2>
          <p className="text-muted-foreground text-xs">
            A floor&rsquo;s plan scale lets a position given in metres also be shown on the plan, and the other way round.
          </p>
        </div>
        {canEdit && editing === null && (
          <Button variant="outline" onClick={() => open(null)}>
            Add floor
          </Button>
        )}
      </div>

      {floors.length === 0 && editing === null && <p className="text-muted-foreground text-sm">No floors set up yet.</p>}

      {floors.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left">
              {["Floor", "Building", "Keys", "Plan scale", ""].map((h) => (
                <th key={h} className="text-muted-foreground px-2 py-1.5 text-[11px] uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {floors.map((f) => {
              const s = floorScaleStatus(f);
              return (
                <tr key={f.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-2 py-2">{show(f.label)}</td>
                  <td className="px-2 py-2 text-xs">{show(f.building_name ?? f.building_key)}</td>
                  <td className="text-muted-foreground px-2 py-2 font-mono text-[11px]">
                    {[f.building_key, f.floor_key, f.level_key].map((x) => x ?? "—").join(" / ")}
                  </td>
                  <td className="px-2 py-2 text-xs">
                    {s.ok ? (
                      <>
                        {fmtNum(f.plan_width_m)} × {fmtNum(f.plan_depth_m)} m
                        {aspectMismatch(f) && (
                          <span className="ml-2 text-amber-700">doesn&rsquo;t match the image&rsquo;s aspect; check the scale</span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">{CONVERSION_REFUSAL_LABEL[s.reason]}</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {canEdit && (
                      <button className="text-brand-gold text-xs hover:underline" onClick={() => open(f)}>
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {editing !== null && (
        <div className="space-y-3 rounded-md border border-[var(--border)] p-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {KEYS.map(([k, label]) => (
              <div key={k}>
                <label className={FIELD_LABEL_CLS}>{label}</label>
                <Input className="mt-1.5" value={v[k]} onChange={(e) => setV((p) => ({ ...p, [k]: e.target.value }))} />
              </div>
            ))}
          </div>
          <p className="text-muted-foreground text-[11px]">
            Leave the plan values blank if you don&rsquo;t know them. Positions then stay in the frame they were given in.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save floor"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
