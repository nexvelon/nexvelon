import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  FileSignature,
  PackageCheck,
  Receipt,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  href: string;
  icon: LucideIcon;
  tone: "default" | "warning" | "success" | "danger";
  timeAgo: string;
  unread: boolean;
}

export const SEED_NOTIFICATIONS: AppNotification[] = [
  {
    id: "n-1",
    title: "Quote Q-2026-0118 approved",
    body: "Meridian Capital Plaza approved the lobby access upgrade — $27,759.58.",
    href: "/quotes/q-001",
    icon: FileSignature,
    tone: "success",
    timeAgo: "2m",
    unread: true,
  },
  {
    id: "n-2",
    title: "PO from Anixter received",
    body: "12 of 14 line items received against PO-NX-2026-001-02. 2 backordered.",
    href: "/inventory",
    icon: PackageCheck,
    tone: "default",
    timeAgo: "18m",
    unread: true,
  },
  {
    id: "n-3",
    title: "Invoice INV-2026-0313 overdue",
    body: "Beacon Energy — $28,815.00, 47 days past due.",
    href: "/financials",
    icon: AlertTriangle,
    tone: "danger",
    timeAgo: "1h",
    unread: true,
  },
  {
    id: "n-4",
    title: "Commissioning completed",
    body: "Naomi Khaled signed off Hartwell Estates access doors (12 of 12).",
    href: "/projects/pr-005",
    icon: ClipboardCheck,
    tone: "success",
    timeAgo: "3h",
    unread: true,
  },
  {
    id: "n-5",
    title: "Low stock — Kantech KT-400",
    body: "Only 14 on hand against reorder point 6. Suggested PO drafted.",
    href: "/inventory",
    icon: AlertTriangle,
    tone: "warning",
    timeAgo: "5h",
    unread: false,
  },
  {
    id: "n-6",
    title: "Camera offline — Ironclad bay #4",
    body: "Hanwha PNV-A9081R offline > 6 minutes. Auto-ticket created.",
    href: "/projects/pr-007",
    icon: Camera,
    tone: "warning",
    timeAgo: "Yesterday",
    unread: false,
  },
  {
    id: "n-7",
    title: "Invoice INV-2026-0301 paid",
    body: "Meridian Capital Plaza paid $27,759.58 — funds cleared today.",
    href: "/financials",
    icon: Receipt,
    tone: "success",
    timeAgo: "Yesterday",
    unread: false,
  },
  {
    id: "n-8",
    title: "ULC certificate issued",
    body: "Beacon Energy — substation 04 fire monitoring panel commissioned.",
    href: "/projects/pr-015",
    icon: ShieldCheck,
    tone: "success",
    timeAgo: "2d",
    unread: false,
  },
  {
    id: "n-9",
    title: "Project Mercer Tower passed 50%",
    body: "Aria Vance marked the access reader phase complete (52%).",
    href: "/projects/pr-001",
    icon: CheckCircle2,
    tone: "default",
    timeAgo: "3d",
    unread: false,
  },
];
