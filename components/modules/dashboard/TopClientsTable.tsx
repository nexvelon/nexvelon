"use client";

// DASH-3 — REAL top clients by revenue (pre-tax subtotal of issued invoices).
// UIDG-9 — now FOLLOWS the dashboard's selected range (was hardcoded to the year);
// the gate is re-checked on every refetch. financials:view gated.

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { getTopClientsByRevenueAction } from "@/app/(app)/dashboard/actions";
import { formatCurrency } from "@/lib/format";
import { useDashboardRange } from "@/components/dashboard/range-context";
import type { TopClientRow } from "@/lib/api/dashboard";

export function TopClientsTable() {
  const win = useDashboardRange();
  const [rows, setRows] = useState<TopClientRow[] | null>(null);
  const [restricted, setRestricted] = useState(false);

  useEffect(() => {
    if (!win.valid) return;
    setRows(null);
    setRestricted(false);
    getTopClientsByRevenueAction({ from: win.from, to: win.to }).then((r) => {
      if (r.ok) setRows(r.data);
      else setRestricted(true);
    });
  }, [win.valid, win.from, win.to]);

  return (
    <Card className="bg-card p-5 shadow-sm">
      <h3 className="text-brand-navy mb-3 font-serif text-base">
        Top clients — revenue · {win.label}
      </h3>
      {!win.valid ? (
        <p className="text-muted-foreground text-xs">Choose a start and end date.</p>
      ) : restricted ? (
        <div className="text-muted-foreground flex items-center gap-2 py-6 text-xs">
          <Lock className="h-3.5 w-3.5" /> Requires financials access.
        </div>
      ) : !rows ? (
        <p className="text-muted-foreground text-xs">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-xs">No invoiced revenue in this range.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] uppercase">Client</TableHead>
                <TableHead className="text-right text-[11px] uppercase">Invoices</TableHead>
                <TableHead className="text-right text-[11px] uppercase">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.client_id}>
                  <TableCell className="text-xs" style={{ color: "var(--brand-primary)" }}>{c.client_name}</TableCell>
                  <TableCell className="text-muted-foreground text-right text-xs tabular-nums">{c.invoice_count}</TableCell>
                  <TableCell className="text-right text-xs font-semibold tabular-nums">{formatCurrency(c.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-muted-foreground mt-2 text-[10px]">Pre-tax, issued invoices (sent / partially paid / paid).</p>
        </div>
      )}
    </Card>
  );
}
