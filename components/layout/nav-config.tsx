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

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  resource: Resource;
  /**
   * Optional small ivory chip on the right of the row, e.g. open-quote count.
   *
   * Removed for now — the previous implementation read array lengths from
   * `lib/mock-data/{quotes,projects,clients}` which produced numbers that
   * had no relationship to the real DB (e.g. "20 clients" while the
   * `clients` table held 2 rows). Sidebar.tsx still renders the chip iff
   * `count !== undefined`, so simply omitting the field hides it. We'll
   * re-introduce real counts module-by-module as each one ships its DB
   * wiring.
   */
  count?: number;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, resource: "dashboard" },
  { href: "/quotes", label: "Quotes", icon: FileText, resource: "quotes" },
  { href: "/projects", label: "Projects", icon: FolderKanban, resource: "projects" },
  { href: "/clients", label: "Clients & Sites", icon: Users, resource: "clients" },
  { href: "/inventory", label: "Inventory", icon: Boxes, resource: "inventory" },
  { href: "/scheduling", label: "Scheduling", icon: Calendar, resource: "scheduling" },
  { href: "/financials", label: "Financials", icon: Receipt, resource: "financials" },
  { href: "/users", label: "Users & Permissions", icon: UserCog, resource: "users" },
  { href: "/settings", label: "Settings", icon: Settings, resource: "settings" },
];
