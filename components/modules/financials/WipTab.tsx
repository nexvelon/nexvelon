"use client";

// PROJ2-18 (5c) — the Financials → WIP portfolio. Every active project's
// over/under-billing position, with total overbilled (liability) and total
// underbilled (asset) at the top. This is the "am I financing my clients' jobs"
// dashboard — underbilling is your cash funding their work. financials:edit
// only (the action gates); a view-only holder gets the restricted message.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { getWipPortfolioAction, exportWipCsvAction } from "@/app/(app)/projects/wip-actions";
import type { WipPortfolio, WipPosition } from "@/lib/api/wip";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const POSITION: Record<WipPosition, { label: string; cls: string }> = {
  overbilled: { label: "Overbilled", cls: "bg-[color-mix(in_oklab,#C9A24B_22%,transparent)] text-[#8a6d1f]" },
  underbilled: { label: "Underbilled", cls: "bg-[color-mix(in_oklab,var(--brand-navy)_15%,transparent)] text-brand-navy" },
  even: { label: "Even", cls: "bg-muted text-muted-foreground" },
  indeterminate: { label: "—", cls: "bg-muted text-muted-foreground" },
};

function ou(n: number): string {
  return n >= 0 ? formatCurrency(n) : `(${formatCurrency(Math.abs(n))})`;
}

export function WipTab() {
  const router = useRouter();
  const [portfolio, setPortfolio] = useState<WipPortfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    getWipPortfolioAction().then((res) => {
      if (res.ok) setPortfolio(res.data);
      else setError(res.error);
    });
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportWipCsvAction();
      if (!res.ok) { toast.error(res.error); return; }
      const blob = new Blob([res.data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = res.data.filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("WIP exported");
    } finally {
      setExporting(false);
    }
  };

  if (error) {
    return (
      <Card className="p-6 text-center shadow-sm">
        <p className="text-muted-foreground text-sm">{error}</p>
      </Card>
    );
  }
  if (!portfolio) return null;

  const { totals } = portfolio;
  return (
    <div className="space-y-4">
      {/* Totals */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-t-2 border-t-[#C9A24B] p-4 shadow-sm">
          <p className="text-muted-foreground font-serif text-[11px] tracking-wide">Total overbilled (liability)</p>
          <p className="text-xl font-semibold tabular-nums text-[#8a6d1f]">{formatCurrency(totals.overbilled)}</p>
          <p className="text-muted-foreground text-[11px]">Billed ahead of work done.</p>
        </Card>
        <Card className="border-t-2 border-t-brand-navy p-4 shadow-sm">
          <p className="text-muted-foreground font-serif text-[11px] tracking-wide">Total underbilled (asset)</p>
          <p className="text-brand-navy text-xl font-semibold tabular-nums">{formatCurrency(Math.abs(totals.underbilled))}</p>
          <p className="text-muted-foreground text-[11px]">Work done, not yet invoiced — your cash funding it.</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <p className="text-muted-foreground font-serif text-[11px] tracking-wide">Net position</p>
          <p className={cn("text-xl font-semibold tabular-nums", totals.net >= 0 ? "text-[#8a6d1f]" : "text-brand-navy")}>{ou(totals.net)}</p>
          <p className="text-muted-foreground text-[11px]">Overbilled + underbilled.</p>
        </Card>
      </section>

      <div className="flex items-center justify-between">
        <h3 className="text-brand-navy font-serif text-lg">WIP by project</h3>
        <Button type="button" size="xs" variant="outline" onClick={handleExport} disabled={exporting || portfolio.rows.length === 0}>
          <Download className="mr-1 h-3.5 w-3.5" /> Export WIP (CSV)
        </Button>
      </div>

      <Card className="p-0 shadow-sm">
        {portfolio.rows.length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm">No active projects.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] uppercase">Project</TableHead>
                  <TableHead className="text-right text-[11px] uppercase">% compl.</TableHead>
                  <TableHead className="text-right text-[11px] uppercase">Contract</TableHead>
                  <TableHead className="text-right text-[11px] uppercase">Earned</TableHead>
                  <TableHead className="text-right text-[11px] uppercase">Billed</TableHead>
                  <TableHead className="text-right text-[11px] uppercase">Over/(under)</TableHead>
                  <TableHead className="text-[11px] uppercase">Position</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {portfolio.rows.map((r) => {
                  const pos = POSITION[r.position];
                  return (
                    <TableRow key={r.project_id} className="cursor-pointer" onClick={() => router.push(`/projects/${r.project_id}`)}>
                      <TableCell className="text-xs">
                        <span className="text-brand-charcoal font-medium">{r.number ?? "—"}</span>
                        {r.title && <span className="text-muted-foreground"> — {r.title}</span>}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{r.pct_complete == null ? "—" : `${(r.pct_complete * 100).toFixed(0)}%`}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{formatCurrency(r.contract)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{formatCurrency(r.earned)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{formatCurrency(r.billed)}</TableCell>
                      <TableCell className={cn("text-right text-xs font-semibold tabular-nums", r.position === "overbilled" ? "text-[#8a6d1f]" : r.position === "underbilled" ? "text-brand-navy" : "text-muted-foreground")}>{ou(r.over_under)}</TableCell>
                      <TableCell>
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", pos.cls)}>{pos.label}</span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <p className="text-muted-foreground text-[11px]">
        % complete is cost-to-cost (actual cost ÷ estimated cost). Earned =
        contract × % complete; over/(under) billed = billed − earned. Holdback is
        a payment-timing memo and is not folded into this position.
      </p>
    </div>
  );
}
