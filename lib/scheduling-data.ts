import { addDays, addHours, format, parseISO, startOfWeek } from "date-fns";
import { TODAY } from "./dashboard-data";
import { projects } from "./mock-data/projects";
import { clients } from "./mock-data/clients";
import { sites as ALL_SITES } from "./mock-data/sites";
import { users } from "./mock-data/users";
import type { User } from "./types";

export type JobType =
  | "Install"
  | "Service"
  | "Inspection"
  | "Commissioning"
  | "Emergency";

export type JobStatus = "Scheduled" | "In Progress" | "Complete" | "Cancelled";

export interface ScheduleJob {
  id: string;
  type: JobType;
  status: JobStatus;
  projectId?: string;
  clientId: string;
  siteId?: string;
  techId?: string;
  start: string; // ISO
  end: string; // ISO
  durationMin: number;
  systemSummary: string;
  priority: "Low" | "Normal" | "High" | "Urgent";
  requiredSkills: string[];
  notes?: string;
}

const TECH_IDS = ["u-006", "u-007", "u-011", "u-012", "u-013", "u-014"];
const PM_IDS = ["u-004", "u-005"];
const SUB_IDS = ["u-008", "u-015", "u-016"];

export function schedulingTechs(): User[] {
  return [
    ...TECH_IDS.map((id) => users.find((u) => u.id === id)).filter(
      (u): u is User => Boolean(u)
    ),
    ...PM_IDS.map((id) => users.find((u) => u.id === id)).filter(
      (u): u is User => Boolean(u)
    ),
  ];
}

export function schedulingSubs(): User[] {
  return SUB_IDS.map((id) => users.find((u) => u.id === id)).filter(
    (u): u is User => Boolean(u)
  );
}

export function weekStart(anchor: Date = TODAY): Date {
  return startOfWeek(anchor, { weekStartsOn: 1 });
}

const SKILLS_BY_SYSTEM: Record<string, string[]> = {
  "Access Control": ["Kantech certified", "C-CURE 9000", "ICT Protege"],
  CCTV: ["Avigilon ACC", "Genetec Omnicast", "Hanwha Wisenet"],
  Intrusion: ["DSC Neo", "ULC monitoring"],
  Intercom: ["Sipelia", "2N IP Verso"],
  "Fire Monitoring": ["ULC ULC-S561", "CFAA certification"],
};

function seed(s: string): number {
  let h = 7;
  for (const ch of s) h = (h * 33 + ch.charCodeAt(0)) % 100000;
  return h;
}

const JOB_TEMPLATES: Array<{
  type: JobType;
  duration: number;
  summary: string;
  priority: ScheduleJob["priority"];
}> = [
  { type: "Install", duration: 480, summary: "Reader install, mounting, terminations", priority: "Normal" },
  { type: "Install", duration: 360, summary: "Camera mounting & cable termination", priority: "Normal" },
  { type: "Service", duration: 120, summary: "Replace failed reader at lobby", priority: "High" },
  { type: "Service", duration: 90, summary: "PoE switch swap & reboot", priority: "Normal" },
  { type: "Inspection", duration: 180, summary: "ULC annual fire inspection", priority: "Normal" },
  { type: "Commissioning", duration: 240, summary: "Walk-test access doors", priority: "Normal" },
  { type: "Commissioning", duration: 180, summary: "Camera analytics tuning", priority: "Normal" },
  { type: "Emergency", duration: 90, summary: "Panel offline — site offline", priority: "Urgent" },
  { type: "Install", duration: 300, summary: "Programming Synergis & schedules", priority: "Normal" },
  { type: "Service", duration: 60, summary: "User database maintenance", priority: "Low" },
];

export function buildJobs(): ScheduleJob[] {
  const ws = weekStart();
  const out: ScheduleJob[] = [];
  const allTechs = [...TECH_IDS, ...PM_IDS, ...SUB_IDS];

  let jobIdx = 0;
  for (let day = 0; day < 7; day++) {
    const date = addDays(ws, day);
    // Each day place 4-6 jobs distributed across techs.
    const count = 4 + (seed(`d${day}`) % 3);
    for (let n = 0; n < count; n++) {
      const tech = allTechs[(jobIdx + day) % allTechs.length];
      const tpl = JOB_TEMPLATES[(jobIdx * 7 + day) % JOB_TEMPLATES.length];
      const project = projects[(jobIdx * 3 + day) % projects.length];
      const startHour = 8 + ((jobIdx + n * 2) % 7);
      const start = addHours(date, startHour);
      const end = new Date(start.getTime() + tpl.duration * 60 * 1000);
      const isPast = end < TODAY;
      const requiredSkills = project.systemTypes.flatMap(
        (s) => SKILLS_BY_SYSTEM[s] ?? []
      );
      const status: JobStatus = isPast
        ? "Complete"
        : start <= TODAY && end > TODAY
          ? "In Progress"
          : "Scheduled";
      out.push({
        id: `job-${jobIdx}`,
        type: tpl.type,
        status,
        projectId: project.id,
        clientId: project.clientId,
        siteId: project.siteId,
        techId: tech,
        start: start.toISOString(),
        end: end.toISOString(),
        durationMin: tpl.duration,
        systemSummary: tpl.summary,
        priority: tpl.priority,
        requiredSkills: requiredSkills.slice(0, 2),
      });
      jobIdx++;
    }
  }

  return out;
}

export interface UnassignedJob {
  id: string;
  type: JobType;
  clientId: string;
  siteId?: string;
  projectId?: string;
  requestedDate: string;
  durationMin: number;
  priority: ScheduleJob["priority"];
  requiredSkills: string[];
  systemSummary: string;
}

export function buildUnassigned(): UnassignedJob[] {
  const ws = weekStart();
  const out: UnassignedJob[] = [];
  const queue: Array<{
    type: JobType;
    duration: number;
    summary: string;
    priority: ScheduleJob["priority"];
    skills: string[];
    clientId: string;
    siteId?: string;
    projectId?: string;
    daysOut: number;
  }> = [
    { type: "Service", duration: 120, summary: "Camera offline at south loading bay", priority: "High", skills: ["Hanwha Wisenet"], clientId: "c-007", siteId: "s-c-007-2", projectId: "pr-007", daysOut: 2 },
    { type: "Install", duration: 360, summary: "New employee badge enrollment & reader add", priority: "Normal", skills: ["Kantech certified"], clientId: "c-001", siteId: "s-c-001-1", projectId: "pr-001", daysOut: 4 },
    { type: "Inspection", duration: 180, summary: "ULC annual fire inspection — substation 04", priority: "Normal", skills: ["CFAA certification", "ULC monitoring"], clientId: "c-017", siteId: "s-c-017-1", projectId: "pr-015", daysOut: 6 },
    { type: "Emergency", duration: 90, summary: "Garage barrier arm down, no entry", priority: "Urgent", skills: ["Hartmann"], clientId: "c-008", siteId: "s-c-008-1", projectId: "pr-008", daysOut: 0 },
    { type: "Service", duration: 60, summary: "Add 8 new credentials to tenant block", priority: "Low", skills: ["C-CURE 9000"], clientId: "c-001", siteId: "s-c-001-2", projectId: "pr-001", daysOut: 1 },
    { type: "Commissioning", duration: 240, summary: "Walk-test cleanroom door interlocks", priority: "High", skills: ["ICT Protege"], clientId: "c-010", siteId: "s-c-010-1", projectId: "pr-010", daysOut: 3 },
    { type: "Install", duration: 480, summary: "Mount and terminate 12 H6A bullets", priority: "Normal", skills: ["Avigilon ACC"], clientId: "c-002", siteId: "s-c-002-2", projectId: "pr-002", daysOut: 5 },
    { type: "Service", duration: 90, summary: "Replace dead PG9914 sensor zone 14", priority: "Normal", skills: ["DSC Neo"], clientId: "c-005", siteId: "s-c-005-1", projectId: "pr-005", daysOut: 2 },
  ];
  queue.forEach((q, idx) => {
    out.push({
      id: `unassigned-${idx}`,
      type: q.type,
      clientId: q.clientId,
      siteId: q.siteId,
      projectId: q.projectId,
      requestedDate: addDays(ws, q.daysOut).toISOString().slice(0, 10),
      durationMin: q.duration,
      priority: q.priority,
      requiredSkills: q.skills,
      systemSummary: q.summary,
    });
  });
  return out;
}

export function jobLabelTime(j: ScheduleJob): string {
  return `${format(parseISO(j.start), "HH:mm")}–${format(parseISO(j.end), "HH:mm")}`;
}

export const JOB_TYPE_COLOR: Record<JobType, { bg: string; ring: string; text: string }> = {
  Install: { bg: "#0B1B3B", ring: "#0B1B3B", text: "#FFFFFF" },
  Service: { bg: "#475569", ring: "#475569", text: "#FFFFFF" },
  Inspection: { bg: "#1E40AF", ring: "#1E40AF", text: "#FFFFFF" },
  Commissioning: { bg: "#C9A24B", ring: "#C9A24B", text: "#0B1B3B" },
  Emergency: { bg: "#DC2626", ring: "#DC2626", text: "#FFFFFF" },
};

export interface SchedulingStats {
  jobsToday: number;
  unassigned: number;
  techsOut: number;
  utilizationPct: number;
}

export function computeSchedulingStats(
  jobs: ScheduleJob[],
  unassigned: UnassignedJob[]
): SchedulingStats {
  const todayStr = TODAY.toISOString().slice(0, 10);
  const todayJobs = jobs.filter((j) => j.start.slice(0, 10) === todayStr).length;

  // 1 PTO mock + suspended user
  const techsOut =
    1 + users.filter((u) => !u.active && (u.role === "Technician" || u.role === "ProjectManager")).length;

  const totalCapacityMin = schedulingTechs().length * 5 * 8 * 60;
  const bookedMin = jobs.reduce((s, j) => s + j.durationMin, 0);
  const utilizationPct = totalCapacityMin === 0 ? 0 : Math.min(100, (bookedMin / totalCapacityMin) * 100);

  return {
    jobsToday: todayJobs,
    unassigned: unassigned.length,
    techsOut,
    utilizationPct: Math.round(utilizationPct),
  };
}

export interface TechProfileExtras {
  certifications: string[];
  licenseEsa: string;
  vehicle: string;
  workingAtHeights: boolean;
}

export function techExtras(techId: string): TechProfileExtras {
  const idx = seed(techId);
  const certBank = [
    "Kantech EntraPass",
    "Avigilon ACC 7",
    "Genetec Synergis",
    "C-CURE 9000",
    "ULC ULC-S561",
    "CFAA Fire Alarm Tech II",
    "ICT Protege Engineer",
    "Hanwha Wisenet Certified",
    "Lenel OnGuard",
  ];
  const certs: string[] = [];
  for (let i = 0; i < 3; i++) certs.push(certBank[(idx + i) % certBank.length]);
  return {
    certifications: Array.from(new Set(certs)),
    licenseEsa: `ESA #${1000 + (idx % 4000)}`,
    vehicle: idx % 3 === 0 ? "Truck 1 — Ford Transit (NX-T1)" : idx % 3 === 1 ? "Truck 2 — Ford Transit (NX-T2)" : "Truck 3 — Ram Promaster (NX-T3)",
    workingAtHeights: idx % 5 !== 0,
  };
}

export function getClient(clientId: string) {
  return clients.find((c) => c.id === clientId);
}
export function getSite(siteId?: string) {
  return siteId ? ALL_SITES.find((s) => s.id === siteId) : undefined;
}
