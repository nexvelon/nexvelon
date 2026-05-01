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
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, resource: "dashboard" },
  { href: "/quotes", label: "Quotes", icon: FileText, resource: "quotes" },
  { href: "/projects", label: "Projects", icon: FolderKanban, resource: "projects" },
  { href: "/clients", label: "Clients", icon: Users, resource: "clients" },
  { href: "/inventory", label: "Inventory", icon: Boxes, resource: "inventory" },
  { href: "/scheduling", label: "Scheduling", icon: Calendar, resource: "scheduling" },
  { href: "/financials", label: "Financials", icon: Receipt, resource: "financials" },
  { href: "/users", label: "Users", icon: UserCog, resource: "users" },
  { href: "/settings", label: "Settings", icon: Settings, resource: "settings" },
];
