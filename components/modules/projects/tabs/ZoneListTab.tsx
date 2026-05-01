"use client";

import { useMemo, useState } from "react";
import { Download, Plus, Printer, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildZones,
  type IntrusionZone,
  type LoopResponse,
  type ZoneType,
} from "@/lib/project-data";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
  readOnly?: boolean;
}

const ZONE_TYPES: ZoneType[] = [
  "Door/Window Contact",
  "Motion PIR",
  "Glass Break",
  "Smoke",
  "Heat",
  "Hold-up",
  "Tamper",
  "Aux",
];

const LOOP_RESPONSES: LoopResponse[] = ["Standard", "Fast", "24hr"];

const TEMPLATES = ["Office Standard", "Warehouse", "Residential", "Multi-Tenant"] as const;

export function ZoneListTab({ project, readOnly }: Props) {
  const seed = useMemo(() => buildZones(project), [project]);
  const [zones, setZones] = useState<IntrusionZone[]>(seed);

  if (!project.systemTypes.includes("Intrusion")) {
    return (
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="text-muted-foreground py-12 text-center text-sm">
          Zone programming is only relevant to projects with an intrusion
          panel. This project has no intrusion scope.
        </CardContent>
      </Card>
    );
  }

  const update = (id: string, patch: Partial<IntrusionZone>) => {
    if (readOnly) return;
    setZones((prev) => prev.map((z) => (z.id === id ? { ...z, ...patch } : z)));
  };

  const remove = (id: string) => {
    if (readOnly) return;
    setZones((prev) => prev.filter((z) => z.id !== id));
  };

  const addZone = () => {
    if (readOnly) return;
    const nextNumber = zones.length === 0 ? 1 : Math.max(...zones.map((z) => z.zoneNumber)) + 1;
    const z: IntrusionZone = {
      id: `z-${project.id}-new-${Date.now()}`,
      projectId: project.id,
      zoneNumber: nextNumber,
      name: `Zone ${nextNumber}`,
      type: "Door/Window Contact",
      partition: 1,
      loopResponse: "Standard",
      bypassAllowed: true,
      chime: false,
      reports: true,
    };
    setZones((prev) => [...prev, z]);
  };

  const partitions = Array.from(new Set(zones.map((z) => z.partition))).sort();
  const used = zones.length;
  const available = (project.panelModel ?? "").includes("HS2128") ? 128 : 32;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="font-serif text-lg">
            Intrusion Zone Programming
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" disabled={readOnly} onClick={addZone}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Zone
            </Button>
            <Select
              onValueChange={(v) =>
                toast.info(`Imported template: ${v}`, {
                  description: "Demo: a real build would replace zone rows with the template.",
                })
              }
              disabled={readOnly}
            >
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="Import from Template" />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                toast.info("Exported CSV", { description: "Demo: zone-list.csv generated." })
              }
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              Export CSV
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                toast.info("Programming sheet queued", {
                  description: "Demo: would render an installer-ready PDF.",
                })
              }
            >
              <Printer className="mr-1 h-3.5 w-3.5" />
              Print Sheet
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-[11px] uppercase">#</TableHead>
                  <TableHead className="text-[11px] uppercase">Name</TableHead>
                  <TableHead className="text-[11px] uppercase">Type</TableHead>
                  <TableHead className="w-20 text-[11px] uppercase">Partition</TableHead>
                  <TableHead className="w-28 text-[11px] uppercase">Loop</TableHead>
                  <TableHead className="w-16 text-[11px] uppercase">Bypass</TableHead>
                  <TableHead className="w-16 text-[11px] uppercase">Chime</TableHead>
                  <TableHead className="w-20 text-[11px] uppercase">Reports</TableHead>
                  <TableHead className="text-[11px] uppercase">Notes</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zones.map((z) => (
                  <TableRow key={z.id}>
                    <TableCell className="text-brand-navy font-mono text-xs font-semibold tabular-nums">
                      {z.zoneNumber}
                    </TableCell>
                    <TableCell>
                      <Input
                        value={z.name}
                        onChange={(e) => update(z.id, { name: e.target.value })}
                        disabled={readOnly}
                        className="h-7 text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={z.type}
                        onValueChange={(v) =>
                          update(z.id, { type: (v ?? z.type) as ZoneType })
                        }
                        disabled={readOnly}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ZONE_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        inputMode="numeric"
                        value={z.partition.toString()}
                        onChange={(e) =>
                          update(z.id, {
                            partition: Math.max(1, parseInt(e.target.value, 10) || 1),
                          })
                        }
                        disabled={readOnly}
                        className="h-7 text-center text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={z.loopResponse}
                        onValueChange={(v) =>
                          update(z.id, { loopResponse: (v ?? z.loopResponse) as LoopResponse })
                        }
                        disabled={readOnly}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LOOP_RESPONSES.map((l) => (
                            <SelectItem key={l} value={l}>
                              {l}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        checked={z.bypassAllowed}
                        onChange={(e) => update(z.id, { bypassAllowed: e.target.checked })}
                        disabled={readOnly}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        checked={z.chime}
                        onChange={(e) => update(z.id, { chime: e.target.checked })}
                        disabled={readOnly}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        checked={z.reports}
                        onChange={(e) => update(z.id, { reports: e.target.checked })}
                        disabled={readOnly}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={z.notes ?? ""}
                        onChange={(e) => update(z.id, { notes: e.target.value })}
                        disabled={readOnly}
                        placeholder="—"
                        className="h-7 text-xs"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => remove(z.id)}
                        disabled={readOnly}
                        aria-label="Delete zone"
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {zones.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="text-muted-foreground py-6 text-center text-xs"
                    >
                      No zones yet — click <Upload className="-mt-0.5 inline h-3 w-3" /> Import or Add Zone.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-serif text-lg">Panel Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
          <Item label="Panel model" value={project.panelModel ?? "—"} />
          <Item label="Partitions" value={`${partitions.length}`} />
          <Item label="Zones used / available" value={`${used} / ${available}`} />
          <Item label="Communicator" value="IP + Cellular (PowerSeries TL880LE)" />
        </CardContent>
      </Card>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-[10px] uppercase tracking-wider">
        {label}
      </p>
      <p className="text-brand-charcoal font-medium">{value}</p>
    </div>
  );
}
