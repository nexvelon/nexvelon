"use client";

// DASH-2 — REAL technician utilization from the dispatch board (SCHED-3). The
// prior mock was pseudo-random; this reads each tech's utilization_pct
// (booked ÷ available working hours). When a tech has no working hours set,
// utilization is unknown → shown as "—", never a fabricated %.

import { useEffect, useState } from "react";
import { addDays, endOfDay, startOfDay, startOfWeek } from "date-fns";
import { Gauge, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getDispatchBoardAction } from "@/app/(app)/scheduling/actions";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  name: string;
  is_active: boolean;
  utilization_pct: number | null;
}

export function TechnicianUtilization() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [overall, setOverall] = useState<number | null>(null);
  const [restricted, setRestricted] = useState(false);

  useEffect(() => {
    const first = startOfWeek(new Date(), { weekStartsOn: 1 });
    getDispatchBoardAction({
      from: startOfDay(first).toISOString(),
      to: endOfDay(addDays(first, 6)).toISOString(),
    }).then((r) => {
      if (!r.ok) {
        setRestricted(true);
        setRows([]);
        return;
      }
      setRows(
        r.data.techs.map((t) => ({
          id: t.id,
          name: t.name,
          is_active: t.is_active,
          utilization_pct: t.utilization_pct,
        }))
      );
      setOverall(r.data.stats.utilization_pct);
    });
  }, []);

  return (
    <Card className="bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="text-brand-navy h-4 w-4" />
          <h3 className="text-brand-navy font-serif text-base">Technician utilization <span className="text-muted-foreground text-xs font-normal">· this week</span></h3>
        </div>
        <span className="text-muted-foreground text-[11px]">
          This week{overall != null ? ` · ${overall}% overall` : ""}
        </span>
      </div>

      {restricted ? (
        <div className="text-muted-foreground flex items-center gap-2 py-6 text-xs">
          <Lock className="h-3.5 w-3.5" /> Requires scheduling access.
        </div>
      ) : !rows ? (
        <p className="text-muted-foreground text-xs">Loading…</p>
      ) : rows.filter((t) => t.is_active).length === 0 ? (
        <p className="text-muted-foreground text-xs">No active technicians yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {rows
            .filter((t) => t.is_active)
            .map((t) => (
              <li key={t.id} className="flex items-center gap-3 text-xs">
                <span className="w-28 truncate" style={{ color: "var(--brand-primary)" }}>
                  {t.name}
                </span>
                <div className="bg-muted relative h-2 flex-1 overflow-hidden rounded-full">
                  {t.utilization_pct != null && (
                    <div
                      className={cn(
                        "absolute inset-y-0 left-0 rounded-full",
                        t.utilization_pct >= 90
                          ? "bg-red-500"
                          : t.utilization_pct >= 70
                            ? "bg-emerald-500"
                            : "bg-amber-400"
                      )}
                      style={{ width: `${Math.min(100, t.utilization_pct)}%` }}
                    />
                  )}
                </div>
                <span className="text-muted-foreground w-12 text-right tabular-nums">
                  {t.utilization_pct == null ? "—" : `${t.utilization_pct}%`}
                </span>
              </li>
            ))}
        </ul>
      )}
      <p className="text-muted-foreground mt-3 text-[10px]">
        &ldquo;—&rdquo; means the tech has no working hours set (utilization can&rsquo;t be computed).
      </p>
    </Card>
  );
}
