"use client";

// PROJ2-14 (7c) — a compact read-only warranty line on the job Overview tab, so
// a job that carries its own warranty shows scope + end date + derived state at
// a glance. Management stays at the project level (this doesn't edit). Self-
// hides when the job has no warranty of its own.

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { listWarrantiesForJobAction } from "@/app/(app)/projects/warranty-bond-actions";
import type { WarrantyRow } from "@/lib/api/warranties";
import { ExpiryBadge } from "@/components/modules/projects/ExpiryBadge";

const SCOPE_LABEL: Record<string, string> = {
  workmanship: "Workmanship",
  equipment: "Equipment",
  manufacturer: "Manufacturer",
  extended: "Extended",
  other: "Warranty",
};

export function JobWarrantyLine({ jobId }: { jobId: string }) {
  const [rows, setRows] = useState<WarrantyRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    listWarrantiesForJobAction(jobId).then((res) => {
      setLoaded(true);
      if (res.ok) setRows(res.data);
    });
  }, [jobId]);

  if (!loaded || rows.length === 0) return null;

  return (
    <div className="space-y-1.5 rounded-md border border-[var(--border)] p-3 text-xs">
      <p className="text-muted-foreground inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
        <ShieldCheck className="h-3.5 w-3.5" /> Warranty
      </p>
      {rows.map((w) => (
        <div key={w.id} className="flex flex-wrap items-center gap-2">
          <span className="text-brand-charcoal font-medium">{SCOPE_LABEL[w.scope] ?? "Warranty"}</span>
          <span className="text-muted-foreground tabular-nums">ends {w.end_date}</span>
          <ExpiryBadge state={w.state} />
        </div>
      ))}
    </div>
  );
}
