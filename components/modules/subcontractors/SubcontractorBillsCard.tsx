"use client";

// SUB-4 — the Bills card on the subcontractor detail page (replaces the SUB-1
// placeholder). Lists every bill booked against this sub with total billed /
// paid / outstanding, and a small summary strip. Financials-gated: the whole
// card only renders for financials:view holders (the action gates server-side
// too) — a subcontractors:view-only role sees nothing cost-side here.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
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
import { listBillsForSubcontractorAction } from "@/app/(app)/financials/actions";
import type { BillListRow } from "@/lib/api/vendor-bills";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  received: "Received",
  partially_paid: "Partially paid",
  paid: "Paid",
  void: "Void",
};

export function SubcontractorBillsCard({ subcontractorId }: { subcontractorId: string }) {
  const { role } = useRole();
  const canView = hasPermission(role, "financials", "view");
  const [rows, setRows] = useState<BillListRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!canView) return;
    listBillsForSubcontractorAction(subcontractorId).then((res) => {
      setLoaded(true);
      if (res.ok) setRows(res.data);
    });
  }, [subcontractorId, canView]);

  if (!canView) return null;

  // Void bills don't count toward billed/paid/outstanding.
  const live = rows.filter((r) => r.status !== "void");
  const totalBilled = live.reduce((s, r) => s + Number(r.total), 0);
  const totalPaid = live.reduce((s, r) => s + r.paid, 0);
  const openBalance = live.reduce((s, r) => s + Math.max(0, r.balance), 0);

  return (
    <Card className="space-y-4 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-brand-navy font-serif text-lg">Bills</h3>
        <div className="flex flex-wrap gap-2">
          <Summary label="Billed" value={totalBilled} />
          <Summary label="Paid" value={totalPaid} tone="text-[var(--brand-status-green)]" />
          <Summary label="Outstanding" value={openBalance} tone={openBalance > 0 ? "text-[#8a6d1f]" : undefined} />
        </div>
      </div>

      {!loaded ? null : rows.length === 0 ? (
        <p className="text-muted-foreground text-[11px]">
          No bills recorded against this subcontractor yet. Record one from the
          Financials → Bills tab (tick &ldquo;This is a subcontractor bill&rdquo;).
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] uppercase">Bill #</TableHead>
                <TableHead className="text-[11px] uppercase">Date</TableHead>
                <TableHead className="text-[11px] uppercase">Project</TableHead>
                <TableHead className="text-[11px] uppercase">Status</TableHead>
                <TableHead className="text-right text-[11px] uppercase">Total</TableHead>
                <TableHead className="text-right text-[11px] uppercase">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.bill_number}</TableCell>
                  <TableCell className="text-xs tabular-nums">{r.bill_date}</TableCell>
                  <TableCell className="text-xs">
                    {r.project_number ? (
                      <Link href={`/projects/${r.project_id}`} className="text-brand-navy hover:underline">
                        {r.project_number}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{STATUS_LABEL[r.status] ?? r.status}</TableCell>
                  <TableCell className="text-right text-xs font-semibold tabular-nums">
                    {formatCurrency(Number(r.total))}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {r.status === "void" ? "—" : formatCurrency(r.balance)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function Summary({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-[10px]">
      {label}{" "}
      <span className={cn("font-semibold tabular-nums", tone ?? "text-brand-charcoal")}>
        {formatCurrency(value)}
      </span>
    </span>
  );
}
