import type { LucideIcon } from "lucide-react";

// Pre-Quotes cleanup (2026-05-11): notification seed emptied. The
// AppNotification type is preserved so consumers (NotificationsBell,
// any future real-DB-backed notifications API) keep typing.
//
// SEED_NOTIFICATIONS will be replaced by a real-time subscription on
// public.notifications (Session B+) — for now the topbar bell renders
// an empty state.

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

export const SEED_NOTIFICATIONS: AppNotification[] = [];
