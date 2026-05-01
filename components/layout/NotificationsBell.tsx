"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  SEED_NOTIFICATIONS,
  type AppNotification,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

const TONE_BG: Record<AppNotification["tone"], string> = {
  default: "bg-brand-navy/10 text-brand-navy",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-700",
};

export function NotificationsBell() {
  const [items, setItems] = useState(SEED_NOTIFICATIONS);
  const unread = items.filter((i) => i.unread).length;

  const markAllRead = () => setItems((prev) => prev.map((i) => ({ ...i, unread: false })));
  const handleClick = (id: string) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, unread: false } : i)));

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
      </PopoverContent>
    </Popover>
  );
}
