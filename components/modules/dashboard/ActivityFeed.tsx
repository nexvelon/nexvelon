"use client";

// DASH-2 — REAL activity feed from the global activity_log (was mock). High-level
// by design: entity type + action + actor + when. No restricted field values are
// shown, so it's safe for any dashboard viewer.

import { useEffect, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getRecentActivityAction } from "@/app/(app)/dashboard/actions";
import type { RecentActivityItem } from "@/lib/api/dashboard";

const ENTITY_LABEL: Record<string, string> = {
  client: "Client",
  site: "Site",
  contact: "Contact",
  inventory: "Product",
  vendor: "Vendor",
  purchase_order: "Purchase order",
  attachment: "Attachment",
  pickup_slip: "Pickup slip",
  rma: "RMA",
  project: "Project",
};

const ACTION_VERB: Record<string, string> = {
  create: "created",
  update: "updated",
  delete: "deleted",
};

export function ActivityFeed() {
  const [items, setItems] = useState<RecentActivityItem[] | null>(null);

  useEffect(() => {
    getRecentActivityAction().then((r) => setItems(r.ok ? r.data.items : []));
  }, []);

  return (
    <Card className="bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Activity className="text-brand-navy h-4 w-4" />
        <h3 className="text-brand-navy font-serif text-base">
          Recent activity <span className="text-muted-foreground text-xs font-normal">· latest events</span>
        </h3>
      </div>
      {!items ? (
        <p className="text-muted-foreground text-xs">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-xs">No recent activity.</p>
      ) : (
        <ol className="space-y-2.5">
          {items.map((a) => (
            <li key={a.id} className="flex items-baseline justify-between gap-3 text-xs">
              <span>
                <span className="font-medium" style={{ color: "var(--brand-primary)" }}>
                  {a.actor_name ?? "System"}
                </span>{" "}
                <span className="text-muted-foreground">
                  {ACTION_VERB[a.action] ?? a.action} a {ENTITY_LABEL[a.entity_type] ?? a.entity_type}
                </span>
              </span>
              <span className="text-muted-foreground shrink-0 tabular-nums">
                {formatDistanceToNowStrict(new Date(a.created_at), { addSuffix: true })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
