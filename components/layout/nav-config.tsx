import {
  LayoutDashboard,
  FileText,
  FolderKanban,
  Users,
  Boxes,
  Calendar,
  Receipt,
  UserCog,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { Resource } from "@/lib/permissions";
import { quotes } from "@/lib/mock-data/quotes";
import { projects } from "@/lib/mock-data/projects";
import { clients } from "@/lib/mock-data/clients";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  resource: Resource;
  /** Optional small ivory chip on the right of the row, e.g. open-quote count. */
  count?: number;
}

const openQuoteCount = quotes.filter(
  (q) => q.status === "Draft" || q.status === "Sent"
).length;

const activeProjectCount = projects.filter(
  (p) =>
    p.status === "In Progress" ||
    p.status === "Planning" ||
    p.status === "Scheduled" ||
    p.status === "Commissioning" ||
    p.status === "At Risk"
).length;

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, resource: "dashboard" },
  { href: "/quotes", label: "Quotes", icon: FileText, resource: "quotes", count: openQuoteCount },
  { href: "/projects", label: "Projects", icon: FolderKanban, resource: "projects", count: activeProjectCount },
  { href: "/clients", label: "Clients & Sites", icon: Users, resource: "clients", count: clients.length },
  { href: "/inventory", label: "Inventory", icon: Boxes, resource: "inventory" },
  { href: "/scheduling", label: "Scheduling", icon: Calendar, resource: "scheduling" },
  { href: "/financials", label: "Financials", icon: Receipt, resource: "financials" },
  { href: "/users", label: "Users & Permissions", icon: UserCog, resource: "users" },
  { href: "/settings", label: "Settings", icon: Settings, resource: "settings" },
];
