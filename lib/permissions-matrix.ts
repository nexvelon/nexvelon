import type { Role } from "./types";

// The Users & Permissions module surfaces a much richer catalog than the
// runtime gates. The runtime enforces the subset that's actually wired
// (financials.view, quotes.viewMargin, quotes.viewInternal, quotes.convert,
// inventory.viewCost, scheduling.viewAll, etc.). The full catalog below
// drives the matrix UI; toggling a row updates local state in the drawer.

export type PermModule =
  | "Dashboard"
  | "Quotes"
  | "Projects"
  | "Inventory"
  | "Scheduling"
  | "Clients & Sites"
  | "Financials"
  | "Users & Permissions"
  | "Settings"
  | "Reports & Exports";

export interface PermissionDef {
  /** stable id used to key role grants */
  id: string;
  module: PermModule;
  label: string;
  description: string;
  /** Set true when the runtime actually enforces this permission today. */
  enforced?: boolean;
}

export const PERMISSION_CATALOG: PermissionDef[] = [
  // Dashboard
  { id: "dashboard.view", module: "Dashboard", label: "View dashboard", description: "Access the executive overview and operational KPIs.", enforced: true },
  { id: "dashboard.viewFinancialKpis", module: "Dashboard", label: "View financial KPIs", description: "See EBITDA, gross-margin, top-clients, and revenue trend cards on the dashboard.", enforced: true },

  // Quotes
  { id: "quotes.view", module: "Quotes", label: "View quotes", description: "List and open existing quotes.", enforced: true },
  { id: "quotes.create", module: "Quotes", label: "Create quote", description: "Start a new quote from /quotes/new.", enforced: true },
  { id: "quotes.editDraft", module: "Quotes", label: "Edit draft", description: "Modify quotes in Draft status." },
  { id: "quotes.editSent", module: "Quotes", label: "Edit sent", description: "Modify quotes after they've been sent to a client." },
  { id: "quotes.approve", module: "Quotes", label: "Approve quote", description: "Move a quote into Approved status." },
  { id: "quotes.convert", module: "Quotes", label: "Convert to project", description: "Promote an Approved quote into a live Project.", enforced: true },
  { id: "quotes.viewMargin", module: "Quotes", label: "View margin", description: "See cost, markup, and gross-margin numbers in the builder.", enforced: true },
  { id: "quotes.viewInternal", module: "Quotes", label: "View internal notes", description: "Read and write the PM-only notes panel.", enforced: true },
  { id: "quotes.delete", module: "Quotes", label: "Delete quote", description: "Hard-delete a quote (cannot be undone)." },
  { id: "quotes.duplicate", module: "Quotes", label: "Duplicate quote", description: "Clone an existing quote as a new Draft." },
  { id: "quotes.exportPdf", module: "Quotes", label: "Export PDF", description: "Download the client-facing PDF of a quote." },

  // Projects
  { id: "projects.view", module: "Projects", label: "View projects", description: "List and open project detail pages.", enforced: true },
  { id: "projects.create", module: "Projects", label: "Create project", description: "Open a new project record without converting from a quote." },
  { id: "projects.edit", module: "Projects", label: "Edit project", description: "Change name, description, dates, or stakeholders." },
  { id: "projects.changeStatus", module: "Projects", label: "Change status", description: "Move project through Planning → Closed lifecycle." },
  { id: "projects.viewFinancialsTab", module: "Projects", label: "View financials tab", description: "Open the project Financials tab with margin & cost data.", enforced: true },
  { id: "projects.editTasks", module: "Projects", label: "Edit tasks", description: "Add, drag, or delete tasks on the Kanban / Gantt." },
  { id: "projects.editSchedule", module: "Projects", label: "Edit schedule", description: "Drag Gantt bars and rebaseline dates." },
  { id: "projects.editMaterials", module: "Projects", label: "Edit materials", description: "Allocate from stock, raise POs, mark as installed." },
  { id: "projects.editCommissioning", module: "Projects", label: "Edit commissioning", description: "Tick off commissioning items, attach photos." },
  { id: "projects.editZoneList", module: "Projects", label: "Edit zone list", description: "Author intrusion zone programming." },
  { id: "projects.uploadDocs", module: "Projects", label: "Upload documents", description: "Attach drawings, datasheets, and customer sign-offs." },
  { id: "projects.logTimeSelf", module: "Projects", label: "Log time (self)", description: "Submit time entries against assigned tasks." },
  { id: "projects.logTimeOthers", module: "Projects", label: "Log time (others)", description: "Submit time on behalf of other technicians." },
  { id: "projects.close", module: "Projects", label: "Close project", description: "Move project into Completed / Closed state." },
  { id: "projects.delete", module: "Projects", label: "Delete project", description: "Archive and hide a project." },

  // Inventory
  { id: "inventory.view", module: "Inventory", label: "View inventory", description: "See SKUs, stock levels, and locations.", enforced: true },
  { id: "inventory.viewCost", module: "Inventory", label: "View cost", description: "See per-unit cost, total value, and avg cost columns.", enforced: true },
  { id: "inventory.editItems", module: "Inventory", label: "Edit items", description: "Update SKU master data: name, vendor, reorder point." },
  { id: "inventory.adjustStock", module: "Inventory", label: "Adjust stock", description: "Increase or decrease on-hand counts (loss, found, audit)." },
  { id: "inventory.createPO", module: "Inventory", label: "Create PO", description: "Raise a draft purchase order against a vendor." },
  { id: "inventory.approvePO", module: "Inventory", label: "Approve PO", description: "Send a draft PO to the vendor." },
  { id: "inventory.receiveStock", module: "Inventory", label: "Receive stock", description: "Mark PO line items as received." },
  { id: "inventory.transferStock", module: "Inventory", label: "Transfer stock", description: "Move stock between warehouse and trucks." },
  { id: "inventory.allocate", module: "Inventory", label: "Allocate to project", description: "Reserve stock against an active project." },

  // Scheduling
  { id: "scheduling.viewAll", module: "Scheduling", label: "View all schedules", description: "See the full crew calendar across all techs.", enforced: true },
  { id: "scheduling.viewOwn", module: "Scheduling", label: "View own schedule", description: "See only their own swimlane." },
  { id: "scheduling.createJob", module: "Scheduling", label: "Create jobs", description: "Drag unassigned jobs onto the calendar." },
  { id: "scheduling.reassign", module: "Scheduling", label: "Reassign jobs", description: "Move a job from one tech to another." },
  { id: "scheduling.editOthers", module: "Scheduling", label: "Edit others' schedule", description: "Change another tech's working hours or job times." },

  // Clients & Sites
  { id: "clients.view", module: "Clients & Sites", label: "View clients", description: "Open client and site records." },
  { id: "clients.create", module: "Clients & Sites", label: "Create client", description: "Add a new client / site." },
  { id: "clients.edit", module: "Clients & Sites", label: "Edit client", description: "Modify contact, address, or billing details." },
  { id: "clients.delete", module: "Clients & Sites", label: "Delete client", description: "Archive a client and its sites." },
  { id: "clients.viewContracts", module: "Clients & Sites", label: "View contracts", description: "See service contracts and renewal dates." },
  { id: "clients.viewServiceHistory", module: "Clients & Sites", label: "View service history", description: "Open historic jobs and visit logs for a client." },

  // Financials
  { id: "financials.view", module: "Financials", label: "View financials", description: "Open the Financials module.", enforced: true },
  { id: "financials.viewPL", module: "Financials", label: "View P&L", description: "See the profit & loss statement." },
  { id: "financials.viewBalanceSheet", module: "Financials", label: "View balance sheet", description: "See the balance sheet statement." },
  { id: "financials.viewCashFlow", module: "Financials", label: "View cash flow", description: "See the cash-flow statement." },
  { id: "financials.createInvoice", module: "Financials", label: "Create invoice", description: "Issue a new invoice against a project." },
  { id: "financials.sendInvoice", module: "Financials", label: "Send invoice", description: "Email an invoice to the client." },
  { id: "financials.receivePayment", module: "Financials", label: "Receive payment", description: "Record a payment against an invoice." },
  { id: "financials.enterBill", module: "Financials", label: "Enter bill", description: "Record a bill from a vendor (AP)." },
  { id: "financials.payBill", module: "Financials", label: "Pay bill", description: "Mark a bill as paid." },
  { id: "financials.viewTax", module: "Financials", label: "View tax", description: "Open the GST/HST summary tab." },
  { id: "financials.runReports", module: "Financials", label: "Run reports", description: "Generate WIP, margin, sales, and other reports." },
  { id: "financials.syncAccounting", module: "Financials", label: "Sync to QuickBooks/Xero", description: "Trigger an outbound sync to the connected accounting system." },

  // Users & Permissions
  { id: "users.view", module: "Users & Permissions", label: "View users", description: "Open the Users & Permissions module.", enforced: true },
  { id: "users.invite", module: "Users & Permissions", label: "Invite user", description: "Send a new-user invitation email." },
  { id: "users.editRoles", module: "Users & Permissions", label: "Edit role presets", description: "Change which permissions are bundled into a role." },
  { id: "users.editPermissions", module: "Users & Permissions", label: "Edit per-user permissions", description: "Override role defaults for a specific user." },
  { id: "users.suspend", module: "Users & Permissions", label: "Suspend user", description: "Block a user from logging in without deleting them." },
  { id: "users.delete", module: "Users & Permissions", label: "Delete user", description: "Hard-delete a user account." },
  { id: "users.viewActivityLog", module: "Users & Permissions", label: "View activity log", description: "Read the system-wide audit trail." },

  // Settings
  { id: "settings.view", module: "Settings", label: "View settings", description: "Open the Settings module.", enforced: true },
  { id: "settings.editCompany", module: "Settings", label: "Edit company info", description: "Change company name, GST/HST #, and address." },
  { id: "settings.editBranding", module: "Settings", label: "Edit branding", description: "Update logos and brand colors." },
  { id: "settings.editThemes", module: "Settings", label: "Edit themes", description: "Pick light/dark themes and accent presets." },
  { id: "settings.manageIntegrations", module: "Settings", label: "Manage integrations", description: "Connect QuickBooks, Slack, Twilio, etc." },
  { id: "settings.manageBackups", module: "Settings", label: "Manage backups", description: "Configure automated DB backup retention." },

  // Reports & Exports
  { id: "reports.view", module: "Reports & Exports", label: "View reports", description: "Browse the report library." },
  { id: "reports.schedule", module: "Reports & Exports", label: "Schedule reports", description: "Set up recurring report deliveries." },
  { id: "reports.exportCsv", module: "Reports & Exports", label: "Export CSV", description: "Download tabular data as CSV." },
  { id: "reports.exportPdf", module: "Reports & Exports", label: "Export PDF", description: "Download formatted reports as PDF." },
  { id: "reports.exportAccounting", module: "Reports & Exports", label: "Export accounting", description: "Export ledgers in QuickBooks / Xero format." },
];

export const MODULE_ORDER: PermModule[] = [
  "Dashboard",
  "Quotes",
  "Projects",
  "Inventory",
  "Scheduling",
  "Clients & Sites",
  "Financials",
  "Users & Permissions",
  "Settings",
  "Reports & Exports",
];

// Default role grants — keep in sync with the runtime permissions where they
// overlap. Anything `enforced: true` here should match the runtime check.
export const ROLE_DEFAULT_PERMISSIONS: Record<Role, Set<string>> = {
  Admin: new Set(PERMISSION_CATALOG.map((p) => p.id)),
  SalesRep: new Set([
    "dashboard.view",
    "quotes.view", "quotes.create", "quotes.editDraft", "quotes.duplicate", "quotes.exportPdf",
    "projects.view",
    "inventory.view",
    "scheduling.viewOwn",
    "clients.view", "clients.create", "clients.edit",
    "reports.view", "reports.exportPdf",
  ]),
  ProjectManager: new Set([
    "dashboard.view", "dashboard.viewFinancialKpis",
    "quotes.view", "quotes.create", "quotes.editDraft", "quotes.editSent", "quotes.approve", "quotes.convert", "quotes.viewMargin", "quotes.viewInternal", "quotes.duplicate", "quotes.exportPdf",
    "projects.view", "projects.create", "projects.edit", "projects.changeStatus", "projects.viewFinancialsTab", "projects.editTasks", "projects.editSchedule", "projects.editMaterials", "projects.editCommissioning", "projects.editZoneList", "projects.uploadDocs", "projects.logTimeSelf", "projects.logTimeOthers", "projects.close",
    "inventory.view", "inventory.viewCost", "inventory.editItems", "inventory.allocate", "inventory.createPO",
    "scheduling.viewAll", "scheduling.createJob", "scheduling.reassign", "scheduling.editOthers",
    "clients.view", "clients.create", "clients.edit", "clients.viewContracts", "clients.viewServiceHistory",
    "financials.view", "financials.viewPL",
    "reports.view", "reports.exportPdf", "reports.exportCsv",
  ]),
  Technician: new Set([
    "dashboard.view",
    "projects.view", "projects.editCommissioning", "projects.editZoneList", "projects.uploadDocs", "projects.logTimeSelf",
    "inventory.view",
    "scheduling.viewOwn",
    "clients.view",
  ]),
  Subcontractor: new Set([
    "dashboard.view",
    "projects.view", "projects.logTimeSelf",
    "scheduling.viewOwn",
  ]),
  Accountant: new Set([
    "dashboard.view", "dashboard.viewFinancialKpis",
    "quotes.view", "quotes.viewMargin", "quotes.viewInternal", "quotes.exportPdf",
    "projects.view", "projects.viewFinancialsTab",
    "inventory.view", "inventory.viewCost",
    "scheduling.viewAll",
    "clients.view", "clients.viewContracts",
    "financials.view", "financials.viewPL", "financials.viewBalanceSheet", "financials.viewCashFlow", "financials.createInvoice", "financials.sendInvoice", "financials.receivePayment", "financials.enterBill", "financials.payBill", "financials.viewTax", "financials.runReports", "financials.syncAccounting",
    "reports.view", "reports.exportPdf", "reports.exportCsv", "reports.exportAccounting",
  ]),
  ViewOnly: new Set([
    "dashboard.view",
    "quotes.view",
    "projects.view",
    "inventory.view",
    "scheduling.viewAll",
    "clients.view",
    "reports.view",
  ]),
};

export function permissionsForRole(role: Role): Set<string> {
  return new Set(ROLE_DEFAULT_PERMISSIONS[role]);
}

export const DATA_SCOPES = [
  "All data",
  "Own records only",
  "Assigned projects only",
  "Specific clients",
  "Specific sites",
] as const;
export type DataScope = (typeof DATA_SCOPES)[number];

export const FIELD_VISIBILITIES = [
  { id: "visibility.cost", label: "Cost prices" },
  { id: "visibility.margin", label: "Margins" },
  { id: "visibility.internalNotes", label: "Internal notes" },
  { id: "visibility.othersTime", label: "Other employees' time entries" },
  { id: "visibility.commissions", label: "Other employees' commissions" },
] as const;
