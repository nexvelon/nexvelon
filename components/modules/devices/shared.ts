// DEVREG-1 — presentation helpers shared by the device list, detail, form and import.

import { OPCO_UNRESOLVED_LABEL, type OpcoResolution } from "@/lib/devices/opco";

export const SELECT_CLS = "mt-1.5 w-full rounded-md border border-[var(--border)] bg-card px-3 py-2 text-sm";
export const FIELD_LABEL_CLS = "text-muted-foreground text-[11px] uppercase tracking-wide";

export const OPCO_LABEL: Record<string, string> = {
  integrated_solutions: "Integrated Solutions",
  guardian: "Guardian",
};

export function opcoText(o: OpcoResolution): string {
  if (o.status === "unresolved") return OPCO_UNRESOLVED_LABEL;
  return OPCO_LABEL[o.opco] ?? o.opco;
}

/** §2.8 — an empty field renders as an em dash, never a made-up default. */
export function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  return String(v);
}

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return Number(v.toFixed(digits)).toString();
}

export interface SiteOption {
  id: string;
  name: string;
  clientName: string | null;
}

export interface ProjectOption {
  id: string;
  label: string;
  siteId: string | null;
}

export interface FloorOption {
  id: string;
  siteId: string;
  label: string;
  buildingKey: string | null;
  buildingName: string | null;
  floorKey: string | null;
}

export interface TypeOption {
  id: string;
  name: string;
  system: string | null;
}
