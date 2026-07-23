"use client";

// FIN-9 — the "holdback I can now collect" worklist on the Receivables tab.
// Every project holding statutory holdback, eligible-and-unreleased first
// (flagged green). A one-click release generates the invoice; the button is
// financials:edit only.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import {
  getHoldbackWorklistAction,
  createHoldbackReleaseAction,
  releaseHoldbackAction,
  getProjectHoldbackStatusAction,
} from "@/app/(app)/financials/actions";
import type { HoldbackWorklistRow } from "@/lib/api/holdback";
import { OPCO_LABEL } from "@/components/modules/invoices/shared";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

function opcoLabel(o: string): string {
  return OPCO_LABEL[o] ?? o;
}

export function HoldbackWorklist() {
  const router = useRouter();
  const { role } = useRole();
  const canEdit = hasPermission(role, "financials", "edit");

  const [rows, setRows] = useState<HoldbackWorklistRow[]>([]);
  const [pending, startTransition] = useTransition();

  const load = () => {
    getHoldbackWorklistAction().then((res) => {
      if (res.ok) setRows(res.data);
    });
  };
  useEffect(load, []);

  // Eligible + unreleased → set up the record if needed, then release, in one
  // click. Keeps the worklist a true "collect it now" surface.
  const handleRelease = (row: HoldbackWorklistRow) =>
    startTransition(async () => {
      const status = await getProjectHoldbackStatusAction(row.project_id);
      if (!status.ok) {
        toast.error(status.error);
        return;
      }
      let releaseId = status.data.release?.id ?? null;
      if (!releaseId) {
        const created = await createHoldbackReleaseAction(row.project_id);
        if (!created.ok) {
          toast.error(created.error);
          return;
        }
        releaseId = created.data.id;
      }
      const res = await releaseHoldbackAction(releaseId, row.project_id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      load();
      toast.success("Holdback released — invoice generated");
    });

  if (rows.length === 0) return null;

  return (
    <Card className="p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-brand-navy font-serif text-lg">Holdback release worklist</h3>
        <p className="text-muted-foreground text-[11px]">
          Statutory holdback retained per project · eligible 60 days after
          substantial completion.
        </p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] uppercase">Project</TableHead>
              <TableHead className="text-[11px] uppercase">Entity</TableHead>
              <TableHead className="text-right text-[11px] uppercase">Retained</TableHead>
              <TableHead className="text-[11px] uppercase">Substantial completion</TableHead>
              <TableHead className="text-[11px] uppercase">Eligible</TableHead>
              <TableHead className="text-[11px] uppercase">Status</TableHead>
              <TableHead className="text-[11px] uppercase" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const ready = r.is_eligible && r.release_status !== "released";
              return (
                <TableRow
                  key={r.project_id}
                  className={cn(ready && "border-l-2 border-l-[var(--brand-status-green)]")}
                >
                  <TableCell
                    className="cursor-pointer text-xs"
                    onClick={() => router.push(`/projects/${r.project_id}`)}
                  >
                    <span className="text-brand-charcoal font-medium">{r.project_number ?? "—"}</span>
                    {r.title && <span className="text-muted-foreground"> — {r.title}</span>}
                  </TableCell>
                  <TableCell className="text-xs">{opcoLabel(r.opco)}</TableCell>
                  <TableCell className="text-brand-navy text-right text-sm font-semibold tabular-nums">
                    {formatCurrency(r.retained)}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">
                    {r.substantial_completion_date ?? "not yet"}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">
                    {r.eligible_release_date ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.release_status === "released" ? (
                      <span className="text-muted-foreground">Released</span>
                    ) : ready ? (
                      <span className="font-medium text-[var(--brand-status-green)]">
                        Ready to release
                      </span>
                    ) : r.substantial_completion_date ? (
                      <span className="text-muted-foreground">Waiting on clock</span>
                    ) : (
                      <span className="text-muted-foreground">Not yet complete</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {canEdit && ready && (
                      <Button
                        type="button"
                        size="xs"
                        onClick={() => handleRelease(r)}
                        disabled={pending}
                      >
                        Release
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
