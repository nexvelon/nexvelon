"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, FileSignature } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { type AppNotification } from "@/lib/notifications";
import {
  getMyNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/(app)/notifications/actions";
import type { DbNotification } from "@/lib/types/database";
import { cn } from "@/lib/utils";

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function toAppNotification(n: DbNotification): AppNotification {
  return {
    id: n.id,
    title: n.title,
    body: n.body ?? "",
    href: n.link ?? "#",
    icon: FileSignature,
    tone: n.type === "quote_declined" ? "warning" : "success",
    timeAgo: timeAgo(n.created_at),
    unread: !n.read_at,
  };
}

const TONE_BG: Record<AppNotification["tone"], string> = {
  default: "bg-brand-navy/10 text-brand-navy",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-700",
};

export function NotificationsBell() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const unread = items.filter((i) => i.unread).length;

  const load = () => {
    void getMyNotificationsAction().then((rows) => setItems(rows.map(toAppNotification)));
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000); // light poll (no realtime subscription yet)
    return () => clearInterval(t);
  }, []);

  const markAllRead = () => {
    setItems((prev) => prev.map((i) => ({ ...i, unread: false })));
    void markAllNotificationsReadAction();
  };
  const handleClick = (id: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, unread: false } : i)));
    void markNotificationReadAction(id);
  };

  return (
    <Popover>
      <PopoverTrigger
        className="text-muted-foreground hover:text-brand-charcoal hover:bg-muted relative inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors"
        aria-label={`Notifications (${unread} unread)`}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="bg-brand-gold ring-background absolute right-1 top-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[9px] font-bold text-brand-navy ring-2 tabular-nums">
            {unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-[360px] overflow-hidden p-0"
      >
        <div className="border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center justify-between">
            <h3 className="text-brand-navy font-serif text-base">
              Notifications
            </h3>
            <Button
              variant="ghost"
              size="xs"
              onClick={markAllRead}
              disabled={unread === 0}
              className="text-muted-foreground"
            >
              <CheckCheck className="mr-1 h-3 w-3" />
              Mark all read
            </Button>
          </div>
          <p className="text-muted-foreground text-[10px]">
            {unread} unread · {items.length} total
          </p>
        </div>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
            <Bell className="text-muted-foreground/40 h-6 w-6" />
            <p className="text-brand-charcoal mt-3 text-xs font-medium">
              No new notifications
            </p>
            <p className="text-muted-foreground mt-1 text-[11px]">
              You&rsquo;re all caught up.
            </p>
          </div>
        ) : (
          <ul className="max-h-[480px] divide-y divide-[var(--border)] overflow-y-auto">
            {items.map((n) => {
              const Icon = n.icon;
              return (
                <li key={n.id}>
                  <Link
                    href={n.href}
                    onClick={() => handleClick(n.id)}
                    className={cn(
                      "hover:bg-muted/40 flex items-start gap-3 px-4 py-3 transition-colors",
                      n.unread && "bg-brand-gold/5"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                        TONE_BG[n.tone]
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-brand-charcoal text-xs leading-snug font-medium">
                        {n.title}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-[11px] leading-snug">
                        {n.body}
                      </p>
                      <p className="text-muted-foreground/70 mt-1 text-[10px] uppercase tracking-wider">
                        {n.timeAgo} ago
                      </p>
                    </div>
                    {n.unread && (
                      <span className="bg-brand-gold mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
