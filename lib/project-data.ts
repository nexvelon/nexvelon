import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { TODAY } from "./dashboard-data";
import { projects } from "./mock-data/projects";
import { products } from "./mock-data/products";
import { users } from "./mock-data/users";
import type {
  Project,
  ProjectStatus,
  SystemType,
  Vendor,
} from "./types";

// ────────────────────────────────────────────────────────────────────────────
// Sub-collection types
// ────────────────────────────────────────────────────────────────────────────

export const TASK_STATUSES = [
  "Not Started",
  "In Progress",
  "Blocked",
  "Review",
  "Done",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PHASES = [
  "Pre-Install",
  "Install",
  "Programming",
  "Commissioning",
  "Closeout",
] as const;
export type TaskPhase = (typeof TASK_PHASES)[number];

export type TaskPriority = "Low" | "Medium" | "High" | "Critical";

export interface ProjectTask {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  phase: TaskPhase;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: string;
  startDate: string;
  durationDays: number;
  dueDate: string;
  dependsOn?: string[];
  subtaskCount?: number;
  isMilestone?: boolean;
  isSubcontractor?: boolean;
}

export const MATERIAL_STATUSES = [
  "Pending",
  "Reserved",
  "Picked",
  "Delivered",
  "Installed",
] as const;
export type MaterialStatus = (typeof MATERIAL_STATUSES)[number];

export interface MaterialAllocation {
  id: string;
  projectId: string;
  productId: string;
  qtyRequired: number;
  qtyAllocated: number;
  qtyUsed: number;
  status: MaterialStatus;
}

export const PO_STATUSES = [
  "Draft",
  "Sent",
  "Confirmed",
  "Partially Received",
  "Received",
] as const;
export type POStatus = (typeof PO_STATUSES)[number];

export interface PurchaseOrder {
  id: string;
  projectId: string;
  number: string;
  vendor: Vendor;
  date: string;
  status: POStatus;
  items: { productId: string; qty: number; cost: number }[];
}

export type ChecklistSection =
  | "Access Control"
  | "CCTV"
  | "Intrusion"
  | "Intercom"
  | "Fire Monitoring"
  | "General Closeout";

export interface CommissioningItem {
  id: string;
  section: ChecklistSection;
  description: string;
  done: boolean;
  notes?: string;
  techInitials?: string;
  completedAt?: string;
  hasPhoto?: boolean;
}

export type ZoneType =
  | "Door/Window Contact"
  | "Motion PIR"
  | "Glass Break"
  | "Smoke"
  | "Heat"
  | "Hold-up"
  | "Tamper"
  | "Aux";

export type LoopResponse = "Standard" | "Fast" | "24hr";

export interface IntrusionZone {
  id: string;
  projectId: string;
  zoneNumber: number;
  name: string;
  type: ZoneType;
  partition: number;
  loopResponse: LoopResponse;
  bypassAllowed: boolean;
  chime: boolean;
  reports: boolean;
  notes?: string;
}

export const DOC_FOLDERS = [
  "Drawings",
  "Datasheets",
  "Permits",
  "Customer Sign-offs",
  "Photos",
  "As-Builts",
  "Warranty",
] as const;
export type DocFolder = (typeof DOC_FOLDERS)[number];

export interface ProjectDoc {
  id: string;
  projectId: string;
  folder: DocFolder;
  name: string;
  size: number;
  uploadedById: string;
  uploadedAt: string;
  version: number;
}

export interface TimeEntry {
  id: string;
  projectId: string;
  techId: string;
  date: string;
  hours: number;
  task: string;
  billable: boolean;
  costRate: number;
  billRate: number;
  notes?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Templates: commissioning checklist by system type
// ────────────────────────────────────────────────────────────────────────────

const ACCESS_TEMPLATE: Omit<CommissioningItem, "id" | "done">[] = [
  { section: "Access Control", description: "All readers respond to valid credentials" },
  { section: "Access Control", description: "Door contacts wired and supervised" },
  { section: "Access Control", description: "REX devices tested at every door" },
  { section: "Access Control", description: "Fail-secure / fail-safe verified per door schedule" },
  { section: "Access Control", description: "Anti-passback configured on parking entry" },
  { section: "Access Control", description: "Time schedules tested across all door groups" },
  { section: "Access Control", description: "Backup power test (battery runtime ≥ 4 hrs)" },
  { section: "Access Control", description: "Tamper switches verified on every panel" },
  { section: "Access Control", description: "Database backup taken and stored offsite" },
];

const CCTV_TEMPLATE: Omit<CommissioningItem, "id" | "done">[] = [
  { section: "CCTV", description: "All cameras online and recording to NVR" },
  { section: "CCTV", description: "Frame rate and resolution per spec (4K @ 15 fps)" },
  { section: "CCTV", description: "Motion zones configured per camera" },
  { section: "CCTV", description: "Storage retention verified (≥ 30 days)" },
  { section: "CCTV", description: "Remote access tested over VPN and mobile" },
  { section: "CCTV", description: "PTZ presets and tour configured" },
  { section: "CCTV", description: "Analytics rules tested (line crossing, loitering)" },
  { section: "CCTV", description: "NTP sync verified across all devices" },
  { section: "CCTV", description: "User accounts and permissions provisioned" },
];

const INTRUSION_TEMPLATE: Omit<CommissioningItem, "id" | "done">[] = [
  { section: "Intrusion", description: "All zones walk-tested" },
  { section: "Intrusion", description: "Entry / exit delays per spec" },
  { section: "Intrusion", description: "Communicator path 1 (IP) tested" },
  { section: "Intrusion", description: "Communicator path 2 (cellular) tested" },
  { section: "Intrusion", description: "Central station signal verification (ULC)" },
  { section: "Intrusion", description: "Keypad programming verified" },
  { section: "Intrusion", description: "User codes provisioned and trained" },
  { section: "Intrusion", description: "Battery backup test (24h standby)" },
  { section: "Intrusion", description: "AC fail / restore test" },
];

const INTERCOM_TEMPLATE: Omit<CommissioningItem, "id" | "done">[] = [
  { section: "Intercom", description: "Audio quality both directions" },
  { section: "Intercom", description: "Video preview at master station" },
  { section: "Intercom", description: "Door release tested from master station" },
  { section: "Intercom", description: "Directory programming complete" },
];

const FIRE_TEMPLATE: Omit<CommissioningItem, "id" | "done">[] = [
  { section: "Fire Monitoring", description: "Panel signals verified at central station" },
  { section: "Fire Monitoring", description: "Trouble / alarm / supervisory paths tested" },
  { section: "Fire Monitoring", description: "ULC certificate issued" },
  { section: "Fire Monitoring", description: "Inspection report filed" },
];

const CLOSEOUT_TEMPLATE: Omit<CommissioningItem, "id" | "done">[] = [
  { section: "General Closeout", description: "As-built drawings delivered" },
  { section: "General Closeout", description: "Customer training session completed" },
  { section: "General Closeout", description: "All credentials / passwords transferred" },
  { section: "General Closeout", description: "Warranty start date recorded" },
  { section: "General Closeout", description: "Service contract activated" },
  { section: "General Closeout", description: "Final walkthrough sign-off" },
];

const TEMPLATE_BY_SYSTEM: Record<SystemType, Omit<CommissioningItem, "id" | "done">[]> = {
  "Access Control": ACCESS_TEMPLATE,
  CCTV: CCTV_TEMPLATE,
  Intrusion: INTRUSION_TEMPLATE,
  Intercom: INTERCOM_TEMPLATE,
  "Fire Monitoring": FIRE_TEMPLATE,
};

// Deterministic pseudo-random for stable seed values keyed off project + idx.
function seededInt(seed: string, max: number): number {
  let h = 7;
  for (const ch of seed) h = (h * 33 + ch.charCodeAt(0)) % 100000;
  return h % max;
}

export function buildCommissioningChecklist(p: Project): CommissioningItem[] {
  const sections: Omit<CommissioningItem, "id" | "done">[] = [];
  for (const t of p.systemTypes) sections.push(...TEMPLATE_BY_SYSTEM[t]);
  sections.push(...CLOSEOUT_TEMPLATE);

  // Completion ratio matches project progress; the demo project (pr-001) gets
  // a richer, scattered completion pattern.
  const completion =
    p.id === "pr-001"
      ? 0.62
      : p.status === "Completed"
        ? 1
        : p.status === "Commissioning"
          ? 0.85
          : Math.min(0.6, p.progress / 100);

  return sections.map((s, idx) => {
    const id = `cm-${p.id}-${idx}`;
    const done = seededInt(`${p.id}-${idx}`, 100) / 100 < completion;
    const tech = users[seededInt(`${p.id}-${idx}-t`, users.length)];
    return {
      id,
      ...s,
      done,
      techInitials: done
        ? tech.name
            .split(" ")
            .map((n) => n[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()
        : undefined,
      completedAt: done
        ? addDays(parseISO(p.startDate), 30 + seededInt(id, 60))
            .toISOString()
            .slice(0, 10)
        : undefined,
      hasPhoto: done && seededInt(id, 3) > 0,
      notes:
        done && seededInt(id, 4) === 0
          ? "Witnessed by client representative; passed on first attempt."
          : undefined,
    };
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Tasks
// ────────────────────────────────────────────────────────────────────────────

const TASK_TEMPLATE: Array<{
  name: string;
  phase: TaskPhase;
  duration: number;
  isMilestone?: boolean;
  isSubcontractor?: boolean;
}> = [
  { name: "Site survey & risk assessment", phase: "Pre-Install", duration: 2 },
  { name: "Permit applications submitted", phase: "Pre-Install", duration: 5, isMilestone: true },
  { name: "Cabling pull (sub-contracted)", phase: "Pre-Install", duration: 6, isSubcontractor: true },
  { name: "Equipment staging & kitting", phase: "Pre-Install", duration: 3 },
  { name: "Mount controllers & power supplies", phase: "Install", duration: 4 },
  { name: "Mount and terminate readers", phase: "Install", duration: 5 },
  { name: "Mount cameras and trim conduit", phase: "Install", duration: 6 },
  { name: "Connect head-end to network VLAN", phase: "Install", duration: 2 },
  { name: "Configure controllers in management software", phase: "Programming", duration: 3 },
  { name: "Program access levels & schedules", phase: "Programming", duration: 4 },
  { name: "Configure NVR storage & retention", phase: "Programming", duration: 2 },
  { name: "Configure analytics & motion zones", phase: "Programming", duration: 3 },
  { name: "Walk-test every door & reader", phase: "Commissioning", duration: 2 },
  { name: "Walk-test cameras & recording paths", phase: "Commissioning", duration: 2 },
  { name: "Battery backup runtime verification", phase: "Commissioning", duration: 1 },
  { name: "ULC central station signal verification", phase: "Commissioning", duration: 1, isMilestone: true },
  { name: "Customer training session", phase: "Closeout", duration: 1 },
  { name: "As-built drawings & documentation", phase: "Closeout", duration: 3 },
  { name: "Final walkthrough sign-off", phase: "Closeout", duration: 1, isMilestone: true },
];

const RICH_TASK_TEMPLATE: typeof TASK_TEMPLATE = [
  ...TASK_TEMPLATE.slice(0, 4),
  { name: "Demolition of legacy KT-1 hardware", phase: "Pre-Install", duration: 2 },
  { name: "120V power circuits to controller cans (by EC)", phase: "Pre-Install", duration: 3, isSubcontractor: true },
  ...TASK_TEMPLATE.slice(4, 8),
  { name: "Migrate cardholder database (legacy → C-CURE)", phase: "Programming", duration: 2 },
  { name: "Build operator workflows in C-CURE 9000", phase: "Programming", duration: 3 },
  ...TASK_TEMPLATE.slice(8),
  { name: "Customer training — security operations", phase: "Closeout", duration: 1 },
  { name: "Spare parts handover & return tracking", phase: "Closeout", duration: 1 },
];

function pickStatus(progress: number, idx: number, total: number): TaskStatus {
  const ratio = idx / total;
  if (ratio < progress / 100 - 0.15) return "Done";
  if (ratio < progress / 100 - 0.05) return idx % 5 === 0 ? "Review" : "Done";
  if (ratio < progress / 100 + 0.05) return idx % 4 === 0 ? "Blocked" : "In Progress";
  if (ratio < progress / 100 + 0.2) return "Not Started";
  return "Not Started";
}

export function buildTasks(p: Project): ProjectTask[] {
  const template = p.id === "pr-001" ? RICH_TASK_TEMPLATE : TASK_TEMPLATE;
  const start = parseISO(p.startDate);
  const tasks: ProjectTask[] = [];
  let cursor = 0;

  template.forEach((t, idx) => {
    const startDate = addDays(start, cursor);
    const dueDate = addDays(startDate, t.duration);
    const status = pickStatus(p.progress, idx, template.length);
    const priorityCycle: TaskPriority[] = ["Medium", "High", "Medium", "Low", "Critical", "Medium"];
    tasks.push({
      id: `t-${p.id}-${idx}`,
      projectId: p.id,
      name: t.name,
      phase: t.phase,
      status,
      priority: priorityCycle[idx % priorityCycle.length],
      assigneeId: users[seededInt(`${p.id}-task-${idx}`, users.length)].id,
      startDate: startDate.toISOString().slice(0, 10),
      durationDays: t.duration,
      dueDate: dueDate.toISOString().slice(0, 10),
      dependsOn: idx > 0 ? [`t-${p.id}-${idx - 1}`] : undefined,
      subtaskCount: idx % 4 === 0 ? 3 + (idx % 3) : undefined,
      isMilestone: t.isMilestone,
      isSubcontractor: t.isSubcontractor,
    });
    cursor += Math.max(1, Math.floor(t.duration * 0.7));
  });

  return tasks;
}

// ────────────────────────────────────────────────────────────────────────────
// Materials & POs
// ────────────────────────────────────────────────────────────────────────────

function pickProductsForProject(p: Project) {
  const out = products.filter((prod) => {
    if (p.systemTypes.includes("Access Control") && prod.category === "Access Control") return true;
    if (p.systemTypes.includes("CCTV") && prod.category === "CCTV") return true;
    if (p.systemTypes.includes("Intrusion") && prod.category === "Intrusion") return true;
    if (p.systemTypes.includes("Intercom") && prod.category === "Intercom") return true;
    if (prod.category === "Cabling" || prod.category === "Power" || prod.category === "Networking") {
      // include some cabling/power on every project
      return seededInt(`${p.id}-${prod.id}`, 5) === 0;
    }
    return false;
  });
  return out.slice(0, p.id === "pr-001" ? 12 : 6);
}

export function buildMaterials(p: Project): MaterialAllocation[] {
  const picks = pickProductsForProject(p);
  return picks.map((prod, idx) => {
    const qtyRequired = Math.max(2, 3 + seededInt(`${p.id}-${prod.id}-q`, 18));
    const allocPct = Math.min(1, p.progress / 100 + 0.1);
    const usedPct = Math.max(0, p.progress / 100 - 0.1);
    const qtyAllocated = Math.round(qtyRequired * allocPct);
    const qtyUsed = Math.round(qtyRequired * usedPct);
    const statusIdx = Math.min(
      MATERIAL_STATUSES.length - 1,
      Math.round((p.progress / 100) * (MATERIAL_STATUSES.length - 1))
    );
    return {
      id: `m-${p.id}-${idx}`,
      projectId: p.id,
      productId: prod.id,
      qtyRequired,
      qtyAllocated,
      qtyUsed,
      status: MATERIAL_STATUSES[statusIdx],
    };
  });
}

export function buildPOs(p: Project): PurchaseOrder[] {
  const picks = pickProductsForProject(p);
  const byVendor: Record<Vendor, typeof picks> = { ADI: [], Anixter: [], Wesco: [], CDW: [], Provo: [] };
  for (const prod of picks) byVendor[prod.vendor].push(prod);

  const pos: PurchaseOrder[] = [];
  const start = parseISO(p.startDate);
  let n = 0;
  (Object.keys(byVendor) as Vendor[]).forEach((vendor, vIdx) => {
    const items = byVendor[vendor];
    if (items.length === 0) return;
    const date = addDays(start, vIdx * 7).toISOString().slice(0, 10);
    const statusIdx = Math.min(
      PO_STATUSES.length - 1,
      Math.round((p.progress / 100) * (PO_STATUSES.length - 1)) + (vIdx % 2)
    );
    const safe = Math.max(0, Math.min(PO_STATUSES.length - 1, statusIdx));
    pos.push({
      id: `po-${p.id}-${n}`,
      projectId: p.id,
      number: `PO-${p.code}-${(++n).toString().padStart(2, "0")}`,
      vendor,
      date,
      status: PO_STATUSES[safe],
      items: items.map((prod) => ({
        productId: prod.id,
        qty: 4 + seededInt(`${p.id}-${prod.id}-poq`, 12),
        cost: prod.cost,
      })),
    });
  });
  return pos;
}

// ────────────────────────────────────────────────────────────────────────────
// Zones (rich for demo project, light for any project that has Intrusion)
// ────────────────────────────────────────────────────────────────────────────

const RICH_ZONES: Omit<IntrusionZone, "id" | "projectId">[] = [
  { zoneNumber: 1, name: "Front Lobby Door", type: "Door/Window Contact", partition: 1, loopResponse: "Standard", bypassAllowed: true, chime: true, reports: true },
  { zoneNumber: 2, name: "Front Lobby Glass", type: "Glass Break", partition: 1, loopResponse: "Standard", bypassAllowed: false, chime: false, reports: true },
  { zoneNumber: 3, name: "Lobby Motion (West)", type: "Motion PIR", partition: 1, loopResponse: "Standard", bypassAllowed: false, chime: false, reports: true },
  { zoneNumber: 4, name: "Lobby Motion (East)", type: "Motion PIR", partition: 1, loopResponse: "Standard", bypassAllowed: false, chime: false, reports: true },
  { zoneNumber: 5, name: "Reception Hold-up Button", type: "Hold-up", partition: 1, loopResponse: "24hr", bypassAllowed: false, chime: false, reports: true },
  { zoneNumber: 6, name: "Loading Dock Door", type: "Door/Window Contact", partition: 2, loopResponse: "Standard", bypassAllowed: true, chime: true, reports: true },
  { zoneNumber: 7, name: "Loading Dock Motion", type: "Motion PIR", partition: 2, loopResponse: "Standard", bypassAllowed: false, chime: false, reports: true },
  { zoneNumber: 8, name: "Back Door (Stairwell B)", type: "Door/Window Contact", partition: 2, loopResponse: "Standard", bypassAllowed: true, chime: true, reports: true },
  { zoneNumber: 9, name: "Server Room Door", type: "Door/Window Contact", partition: 3, loopResponse: "Fast", bypassAllowed: false, chime: false, reports: true, notes: "24/7 armed; RFID + PIN required" },
  { zoneNumber: 10, name: "Server Room Glass Break", type: "Glass Break", partition: 3, loopResponse: "Fast", bypassAllowed: false, chime: false, reports: true },
  { zoneNumber: 11, name: "Server Room Motion", type: "Motion PIR", partition: 3, loopResponse: "Fast", bypassAllowed: false, chime: false, reports: true },
  { zoneNumber: 12, name: "Server Room Smoke", type: "Smoke", partition: 3, loopResponse: "24hr", bypassAllowed: false, chime: false, reports: true },
  { zoneNumber: 13, name: "Mech Room Heat", type: "Heat", partition: 3, loopResponse: "24hr", bypassAllowed: false, chime: false, reports: true },
  { zoneNumber: 14, name: "Mech Room Tamper", type: "Tamper", partition: 3, loopResponse: "24hr", bypassAllowed: false, chime: false, reports: true },
  { zoneNumber: 15, name: "Roof Hatch", type: "Door/Window Contact", partition: 1, loopResponse: "24hr", bypassAllowed: false, chime: false, reports: true },
  { zoneNumber: 16, name: "Mezzanine Window (W)", type: "Door/Window Contact", partition: 2, loopResponse: "Standard", bypassAllowed: false, chime: false, reports: true },
  { zoneNumber: 17, name: "Mezzanine Window (E)", type: "Door/Window Contact", partition: 2, loopResponse: "Standard", bypassAllowed: false, chime: false, reports: true },
  { zoneNumber: 18, name: "Loading Dock Glass Break", type: "Glass Break", partition: 2, loopResponse: "Standard", bypassAllowed: false, chime: false, reports: true },
  { zoneNumber: 19, name: "Aux Input — Fire Panel Relay", type: "Aux", partition: 1, loopResponse: "24hr", bypassAllowed: false, chime: false, reports: true, notes: "Mirrors fire trouble to monitoring centre" },
  { zoneNumber: 20, name: "Aux Input — Generator Status", type: "Aux", partition: 1, loopResponse: "24hr", bypassAllowed: false, chime: false, reports: true },
  { zoneNumber: 21, name: "Stairwell B Door (Upper)", type: "Door/Window Contact", partition: 2, loopResponse: "Standard", bypassAllowed: true, chime: true, reports: true },
  { zoneNumber: 22, name: "Parking Garage Pedestrian Door", type: "Door/Window Contact", partition: 2, loopResponse: "Standard", bypassAllowed: true, chime: true, reports: true },
  { zoneNumber: 23, name: "Garage Tamper (Panel)", type: "Tamper", partition: 2, loopResponse: "24hr", bypassAllowed: false, chime: false, reports: true },
  { zoneNumber: 24, name: "Vault Door", type: "Door/Window Contact", partition: 3, loopResponse: "24hr", bypassAllowed: false, chime: false, reports: true, notes: "Dual-tech contact + accelerometer" },
];

export function buildZones(p: Project): IntrusionZone[] {
  if (p.id === "pr-001") {
    return RICH_ZONES.map((z) => ({ ...z, id: `z-${p.id}-${z.zoneNumber}`, projectId: p.id }));
  }
  if (!p.systemTypes.includes("Intrusion")) return [];
  return RICH_ZONES.slice(0, 8).map((z) => ({
    ...z,
    id: `z-${p.id}-${z.zoneNumber}`,
    projectId: p.id,
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// Documents
// ────────────────────────────────────────────────────────────────────────────

const DEMO_DOCS: Array<Omit<ProjectDoc, "id" | "projectId">> = [
  { folder: "Drawings", name: "01_Floor_Plan_L1_Lobby.pdf", size: 2_410_000, uploadedById: "u-004", uploadedAt: "2026-01-08", version: 3 },
  { folder: "Drawings", name: "02_Reader_Schedule.xlsx", size: 184_000, uploadedById: "u-002", uploadedAt: "2026-01-12", version: 2 },
  { folder: "Drawings", name: "03_Riser_Diagram.pdf", size: 1_220_000, uploadedById: "u-004", uploadedAt: "2026-01-15", version: 1 },
  { folder: "Datasheets", name: "Kantech_KT-400_Datasheet.pdf", size: 410_000, uploadedById: "u-002", uploadedAt: "2026-01-09", version: 1 },
  { folder: "Datasheets", name: "Avigilon_H6A_Spec.pdf", size: 528_000, uploadedById: "u-002", uploadedAt: "2026-01-09", version: 1 },
  { folder: "Datasheets", name: "C-CURE_9000_Operator_Guide.pdf", size: 4_120_000, uploadedById: "u-006", uploadedAt: "2026-01-22", version: 2 },
  { folder: "Permits", name: "City_Permit_Lobby_Wiring.pdf", size: 320_000, uploadedById: "u-001", uploadedAt: "2026-02-04", version: 1 },
  { folder: "Customer Sign-offs", name: "Kickoff_Meeting_Minutes_Signed.pdf", size: 188_000, uploadedById: "u-001", uploadedAt: "2026-02-10", version: 1 },
  { folder: "Customer Sign-offs", name: "Door_Schedule_Approval.pdf", size: 220_000, uploadedById: "u-004", uploadedAt: "2026-02-18", version: 2 },
  { folder: "Photos", name: "Lobby_Existing_Conditions_01.jpg", size: 3_400_000, uploadedById: "u-006", uploadedAt: "2026-02-05", version: 1 },
  { folder: "Photos", name: "L4_Reader_Mounted_R12.jpg", size: 2_800_000, uploadedById: "u-006", uploadedAt: "2026-03-22", version: 1 },
  { folder: "Photos", name: "Garage_P1_Camera_Run.jpg", size: 3_120_000, uploadedById: "u-007", uploadedAt: "2026-03-28", version: 1 },
  { folder: "As-Builts", name: "AsBuilt_Draft_v0.4.pdf", size: 5_800_000, uploadedById: "u-004", uploadedAt: "2026-04-18", version: 4 },
  { folder: "Warranty", name: "Kantech_Warranty_Cert.pdf", size: 96_000, uploadedById: "u-002", uploadedAt: "2026-03-01", version: 1 },
];

export function buildDocs(p: Project): ProjectDoc[] {
  if (p.id === "pr-001") {
    return DEMO_DOCS.map((d, idx) => ({ ...d, id: `d-${p.id}-${idx}`, projectId: p.id }));
  }
  return DEMO_DOCS.slice(0, 5).map((d, idx) => ({
    ...d,
    id: `d-${p.id}-${idx}`,
    projectId: p.id,
    uploadedAt: p.startDate,
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// Time entries
// ────────────────────────────────────────────────────────────────────────────

export function buildTimeEntries(p: Project): TimeEntry[] {
  const entries: TimeEntry[] = [];
  const techs = users.filter(
    (u) =>
      u.role === "Technician" ||
      u.role === "ProjectManager" ||
      u.role === "Subcontractor"
  );
  const start = parseISO(p.startDate);
  const days = Math.max(1, differenceInCalendarDays(TODAY, start));
  const targetCount = p.id === "pr-001" ? 28 : 8;
  for (let i = 0; i < targetCount; i++) {
    const tech = techs[seededInt(`${p.id}-time-${i}`, techs.length)];
    const offset = seededInt(`${p.id}-time-${i}-d`, days);
    const date = addDays(start, offset);
    if (date > TODAY) continue;
    const hours = 2 + seededInt(`${p.id}-time-${i}-h`, 7);
    const billable = seededInt(`${p.id}-time-${i}-b`, 5) > 0;
    const costRate =
      tech.role === "ProjectManager" ? 95 : tech.role === "Subcontractor" ? 65 : 78;
    entries.push({
      id: `te-${p.id}-${i}`,
      projectId: p.id,
      techId: tech.id,
      date: date.toISOString().slice(0, 10),
      hours,
      task: pickTimeTaskLabel(i, p),
      billable,
      costRate,
      billRate: 145,
      notes: i % 4 === 0 ? "Includes 30 min travel each way." : undefined,
    });
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

function pickTimeTaskLabel(idx: number, p: Project): string {
  const labels = [
    "Site survey & measurements",
    "Cabling pull",
    "Reader installation",
    "Camera mounting",
    "Programming & schedules",
    "Walk-test & punch list",
    "Customer training",
    "Battery backup verification",
    "ULC signal verification",
    "As-built updates",
  ];
  return labels[idx % labels.length] + (p.id === "pr-001" ? " — Meridian Capital Plaza" : "");
}

// ────────────────────────────────────────────────────────────────────────────
// Convenience lookups
// ────────────────────────────────────────────────────────────────────────────

export const ACTIVE_STATUSES: ProjectStatus[] = [
  "Planning",
  "Scheduled",
  "In Progress",
  "On Hold",
  "At Risk",
  "Commissioning",
];

export function getProject(id: string): Project | undefined {
  return projects.find((p) => p.id === id);
}

export function projectStats() {
  const active = projects.filter((p) =>
    (
      ["Planning", "Scheduled", "In Progress", "Commissioning"] as ProjectStatus[]
    ).includes(p.status)
  ).length;

  const atRisk = projects.filter(
    (p) =>
      p.status === "At Risk" ||
      (p.status === "In Progress" &&
        differenceInCalendarDays(parseISO(p.targetDate), TODAY) < 30 &&
        p.progress < 70)
  ).length;

  const completedMTD = projects.filter((p) => {
    if (p.status !== "Completed") return false;
    const t = parseISO(p.targetDate);
    return (
      t.getFullYear() === TODAY.getFullYear() &&
      t.getMonth() === TODAY.getMonth()
    );
  }).length;

  const totalBacklog = projects
    .filter((p) =>
      (
        [
          "Planning",
          "Scheduled",
          "In Progress",
          "On Hold",
          "At Risk",
          "Commissioning",
        ] as ProjectStatus[]
      ).includes(p.status)
    )
    .reduce((s, p) => s + Math.max(0, p.budget - p.spent), 0);

  return { active, atRisk, completedMTD, totalBacklog };
}
