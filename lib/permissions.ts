import type { Role } from "./types";

export type Resource =
  | "dashboard"
  | "quotes"
  | "projects"
  | "clients"
  | "inventory"
  | "scheduling"
  | "financials"
  | "users"
  | "settings";

export type Action =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "approve"
  | "convert"
  | "viewMargin"
  | "viewInternal"
  | "viewCost"
  | "viewAll"
  | "manage";

export interface Permission {
  resource: Resource;
  action: Action;
}

const ALL_RESOURCES: Resource[] = [
  "dashboard",
  "quotes",
  "projects",
  "clients",
  "inventory",
  "scheduling",
  "financials",
  "users",
  "settings",
];

const ALL_ACTIONS: Action[] = [
  "view",
  "create",
  "edit",
  "delete",
  "approve",
  "convert",
  "viewMargin",
  "viewInternal",
  "viewCost",
  "viewAll",
  "manage",
];

function full(): Permission[] {
  return ALL_RESOURCES.flatMap((r) =>
    ALL_ACTIONS.map((a) => ({ resource: r, action: a }))
  );
}

function viewAll(): Permission[] {
  return ALL_RESOURCES.map((r) => ({ resource: r, action: "view" as const }));
}

function crud(resources: Resource[]): Permission[] {
  return resources.flatMap((r) =>
    (["view", "create", "edit"] as Action[]).map((a) => ({ resource: r, action: a }))
  );
}

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  Admin: full(),

  // Sales reps own quote drafting and client work, but never see margin or
  // internal-only notes, and never have financials visibility.
  SalesRep: [
    ...viewAll().filter(
      (p) =>
        p.resource !== "users" &&
        p.resource !== "settings" &&
        p.resource !== "financials"
    ),
    ...crud(["quotes", "clients"]),
    { resource: "projects", action: "view" },
    { resource: "inventory", action: "view" },
    // Sales Reps explicitly cannot see inventory cost columns.
  ],

  // PMs run delivery — full quote authority including conversion, margin, and
  // internal notes. They also see schedule for everyone, not just themselves.
  ProjectManager: [
    ...viewAll().filter((p) => p.resource !== "users"),
    ...crud(["projects", "scheduling", "quotes"]),
    { resource: "quotes", action: "approve" },
    { resource: "quotes", action: "convert" },
    { resource: "quotes", action: "viewMargin" },
    { resource: "quotes", action: "viewInternal" },
    { resource: "inventory", action: "edit" },
    { resource: "inventory", action: "viewCost" },
    { resource: "scheduling", action: "viewAll" },
    { resource: "clients", action: "edit" },
  ],

  Technician: [
    { resource: "dashboard", action: "view" },
    { resource: "projects", action: "view" },
    { resource: "scheduling", action: "view" },
    { resource: "inventory", action: "view" },
    { resource: "clients", action: "view" },
    // Technicians see only their own schedule (no scheduling.viewAll), and
    // cannot see inventory cost columns.
  ],

  Subcontractor: [
    { resource: "dashboard", action: "view" },
    { resource: "scheduling", action: "view" },
    { resource: "projects", action: "view" },
  ],

  // Accountants see everything for finance review (incl. margin & internal
  // notes) but cannot edit quotes — read-only enforcement happens in the UI.
  Accountant: [
    ...viewAll().filter((p) => p.resource !== "users"),
    ...crud(["financials"]),
    { resource: "financials", action: "approve" },
    { resource: "quotes", action: "viewMargin" },
    { resource: "quotes", action: "viewInternal" },
    { resource: "inventory", action: "viewCost" },
    { resource: "scheduling", action: "viewAll" },
  ],

  ViewOnly: viewAll().filter(
    (p) => p.resource !== "users" && p.resource !== "settings"
  ),
};

export const ROLE_LABELS: Record<Role, string> = {
  Admin: "Admin",
  SalesRep: "Sales Rep",
  ProjectManager: "Project Manager",
  Technician: "Technician",
  Subcontractor: "Subcontractor",
  Accountant: "Accountant",
  ViewOnly: "View Only",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  Admin: "Full access to every module and setting.",
  SalesRep: "Drafts quotes and manages clients; no margin or financials.",
  ProjectManager: "Owns projects, scheduling, and quote conversion.",
  Technician: "Field-facing read access to projects and schedule.",
  Subcontractor: "Limited view of assigned projects and schedule.",
  Accountant: "Full visibility incl. margin; read-only on quotes.",
  ViewOnly: "Read-only across operational modules.",
};

export function hasPermission(role: Role, resource: Resource, action: Action): boolean {
  return ROLE_PERMISSIONS[role].some(
    (p) => p.resource === resource && p.action === action
  );
}

export function canViewRoute(role: Role, resource: Resource): boolean {
  return hasPermission(role, resource, "view");
}
