"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { ActivityEvent } from "@/lib/dashboard-data";
import { TODAY } from "@/lib/dashboard-data";

interface Props {
  events: ActivityEvent[];
}

const KIND_LABEL: Record<ActivityEvent["kind"], string> = {
  quote: "Quote",
  invoice: "Invoice",
  project: "Project",
  po: "Purchase Order",
};

function relative(d: Date): string {
  const ms = TODAY.getTime() - d.getTime();
  if (ms < 1000 * 60) return "just now";
  return `${formatDistanceToNowStrict(d, { addSuffix: false })} ago`;
}

export function ActivityFeed({ events }: Props) {
  return (
    <Card className="h-full transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="font-serif text-lg">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-4 pl-5">
          <span className="bg-border absolute top-1 bottom-1 left-1.5 w-px" />
          {events.map((e, idx) => (
            <motion.li
              key={e.id}
              className="relative"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.04 }}
            >
              <span className="bg-brand-gold ring-background absolute top-1.5 -left-[14px] h-2.5 w-2.5 rounded-full ring-4" />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-brand-charcoal text-sm leading-snug">
                    {e.message}
                  </p>
                  <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
                    <span className="text-brand-navy/70 font-medium">
                      {KIND_LABEL[e.kind]}
                    </span>
                    <span>·</span>
                    <span>{relative(e.timestamp)}</span>
                  </div>
                </div>
                {e.amount !== undefined && (
                  <span className="text-brand-navy text-sm font-semibold tabular-nums whitespace-nowrap">
                    {formatCurrency(e.amount)}
                  </span>
                )}
              </div>
            </motion.li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
