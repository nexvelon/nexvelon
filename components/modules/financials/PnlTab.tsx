"use client";

// FIN-8 — the Financials P&L tab: per-opco P&L cards (the two corporations
// never blended) + a project portfolio ranked by margin. Entirely
// financials:edit — every number here is cost/margin. A view-only caller sees
// the not-permitted card.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
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
  getOpcoPnlAction,
  getPnlPortfolioAction,
  exportOpcoPnlCsvAction,
} from "@/app/(app)/financials/actions";
import type { OpcoPnl, PnlPortfolioRow } from "@/lib/api/project-pnl";
import { OPCO_LABEL } from "@/components/modules/invoices/shared";
import { formatCurrency, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

function opcoLabel(opco: string): string {
  return OPCO_LABEL[opco] ?? opco;
}

export function PnlTab() {
  const router = useRouter();
  const { role } = useRole();
  const canSee = hasPermission(role, "financials", "edit");

  const [opcos, setOpcos] = useState<OpcoPnl[]>([]);
  const [portfolio, setPortfolio] = useState<PnlPortfolioRow[]>([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!canSee) return;
    let active = true;
    Promise.all([getOpcoPnlAction(), getPnlPortfolioAction()]).then(
      ([o, p]) => {
        if (!active) return;
        if (o.ok) setOpcos(o.data);
        if (p.ok) setPortfolio(p.data);
      }
    );
    return () => {
      active = false;
    };
  }, [canSee]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportOpcoPnlCsvAction();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const blob = new Blob([res.data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.data.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("P&L exported");
    } finally {
      setExporting(false);
    }
  };

  if (!canSee) {
    return (
      <Card className="p-6 text-center shadow-sm">
        <p className="text-muted-foreground text-sm">
          Profit &amp; loss needs the financials edit permission.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-brand-navy font-serif text-lg">
          Profit &amp; loss by entity — project-to-date
        </h3>
        <Button type="button" size="xs" variant="outline" onClick={handleExport} disabled={exporting}>
          <Download className="mr-1 h-3.5 w-3.5" />
          Export P&amp;L (CSV)
        </Button>
      </div>

      {/* Per-opco cards — the two corporations, side by side, never summed. */}
      {opcos.length === 0 ? (
        <Card className="p-6 text-center shadow-sm">
          <p className="text-muted-foreground text-sm">No active project revenue yet.</p>
        </Card>
      ) : (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {opcos.map((o) => {
            const loss = o.gross_profit < 0;
            return (
              <Card key={o.opco} className="border-t-2 border-t-[#C9A24B] p-4 shadow-sm">
                <div className="flex items-baseline justify-between">
                  <p className="text-brand-navy font-serif text-base">{opcoLabel(o.opco)}</p>
                  <p className="text-muted-foreground text-[11px]">
                    {o.project_count} project{o.project_count === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="mt-3 space-y-1.5 text-xs">
                  <Line label="Revenue" value={formatCurrency(o.revenue)} />
                  <Line label="Materials (billed)" value={`(${formatCurrency(o.materials_billed)})`} muted />
                  <Line label="Labour" value={`(${formatCurrency(o.labour)})`} muted />
                  <div className="flex justify-between border-t border-[var(--border)] pt-1.5 text-sm font-semibold">
                    <span>Gross profit</span>
                    <span className={cn("tabular-nums", loss ? "text-red-600" : "text-brand-navy")}>
                      {formatCurrency(o.gross_profit)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gross margin</span>
                    <span className={cn("tabular-nums", loss && "text-red-600")}>
                      {o.gross_margin_pct == null ? "—" : formatPercent(o.gross_margin_pct / 100)}
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </section>
      )}

      <p className="text-muted-foreground text-[11px]">
        Each corporation is a separate P&amp;L — never blended. Project-to-date
        (not period-scoped). Management figure, not a statutory statement.
      </p>

      {/* Portfolio — ranked by margin. */}
      <Card className="p-4 shadow-sm">
        <h3 className="text-brand-navy mb-3 font-serif text-lg">
          Projects ranked by margin
        </h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] uppercase">Project</TableHead>
                <TableHead className="text-[11px] uppercase">Entity</TableHead>
                <TableHead className="text-right text-[11px] uppercase">Revenue</TableHead>
                <TableHead className="text-right text-[11px] uppercase">Direct cost</TableHead>
                <TableHead className="text-right text-[11px] uppercase">Gross profit</TableHead>
                <TableHead className="text-right text-[11px] uppercase">Margin</TableHead>
                <TableHead className="text-right text-[11px] uppercase">Billed %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {portfolio.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground py-6 text-center text-xs">
                    No active projects.
                  </TableCell>
                </TableRow>
              )}
              {portfolio.map((p) => {
                const loss = p.gross_profit != null && p.gross_profit < 0;
                return (
                  <TableRow
                    key={p.project_id}
                    className={cn("cursor-pointer", loss && "border-l-2 border-l-red-500/70")}
                    onClick={() => router.push(`/projects/${p.project_id}`)}
                  >
                    <TableCell className="text-xs">
                      <span className="text-brand-charcoal font-medium">{p.number ?? "—"}</span>
                      {p.title && <span className="text-muted-foreground"> — {p.title}</span>}
                    </TableCell>
                    <TableCell className="text-xs">{opcoLabel(p.opco)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatCurrency(p.revenue)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {p.canonical_direct == null ? "—" : formatCurrency(p.canonical_direct)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right text-xs font-semibold tabular-nums",
                        loss && "text-red-600"
                      )}
                    >
                      {p.gross_profit == null ? "—" : formatCurrency(p.gross_profit)}
                    </TableCell>
                    <TableCell
                      className={cn("text-right text-xs tabular-nums", loss && "text-red-600")}
                    >
                      {p.gross_margin_pct == null ? "—" : formatPercent(p.gross_margin_pct / 100)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {p.billed_pct == null ? "—" : formatPercent(p.billed_pct)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function Line({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className={muted ? "text-muted-foreground" : "text-brand-charcoal"}>{label}</span>
      <span className="text-brand-charcoal tabular-nums">{value}</span>
    </div>
  );
}
