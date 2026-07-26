"use client";

// REP-1 — the WIP report view: proves the export foundation end to end. Renders
// the WIP portfolio table on screen (financials:edit gated) with CSV / Excel /
// PDF export buttons, each calling exportWipReportAction → downloadReport.

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, FileSpreadsheet, FileText, Lock, Sheet } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/layout/PageHeader";
import { getWipReportAction, exportWipReportAction } from "@/app/(app)/reports/actions";
import { downloadReport } from "@/lib/reports/download";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WipPortfolio } from "@/lib/api/wip";
import type { ReportFormat } from "@/lib/reports/export";

export default function WipReportPage() {
  const [portfolio, setPortfolio] = useState<WipPortfolio | null>(null);
  const [restricted, setRestricted] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    getWipReportAction().then((r) => {
      if (r.ok) setPortfolio(r.data);
      else setRestricted(true);
    });
  }, []);

  const doExport = (format: ReportFormat) =>
    start(async () => {
      const res = await exportWipReportAction({ format });
      if (!res.ok) { toast.error(res.error); return; }
      downloadReport(res.data);
    });

  if (restricted) {
    return (
      <div className="mx-auto max-w-md py-16">
        <Card className="bg-card border-t-2 border-t-[#C9A24B] p-8 text-center shadow-sm">
          <div className="bg-brand-charcoal/5 text-brand-charcoal/50 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="text-brand-navy font-serif text-2xl">Restricted Access</h1>
          <p className="text-muted-foreground mt-2 text-sm">This report requires financial access.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/reports" className="text-muted-foreground hover:text-brand-charcoal inline-flex items-center gap-1.5 text-[12px] font-medium">
        <ArrowLeft className="h-3.5 w-3.5" /> Reports
      </Link>
      <PageHeader
        eyebrow="Financial report"
        title="Work-in-progress (WIP)"
        description="Over- and under-billing across active projects."
        actions={
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => doExport("csv")}>
              <FileText className="mr-1 h-3.5 w-3.5" /> CSV
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => doExport("xlsx")}>
              <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Excel
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => doExport("pdf")}>
              <Sheet className="mr-1 h-3.5 w-3.5" /> PDF
            </Button>
          </div>
        }
      />

      <Card className="bg-card overflow-hidden p-0 shadow-sm">
        {!portfolio ? (
          <p className="text-muted-foreground p-6 text-sm">Loading…</p>
        ) : portfolio.rows.length === 0 ? (
          <p className="text-muted-foreground p-6 text-sm">No active projects — nothing in progress.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] uppercase">Project</TableHead>
                  <TableHead className="text-[11px] uppercase">Title</TableHead>
                  <TableHead className="text-right text-[11px] uppercase">Contract</TableHead>
                  <TableHead className="text-right text-[11px] uppercase">Actual cost</TableHead>
                  <TableHead className="text-right text-[11px] uppercase">Earned</TableHead>
                  <TableHead className="text-right text-[11px] uppercase">Billed</TableHead>
                  <TableHead className="text-right text-[11px] uppercase">Over/(under)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {portfolio.rows.map((r) => (
                  <TableRow key={r.project_id}>
                    <TableCell className="font-mono text-xs">{r.number ?? "—"}</TableCell>
                    <TableCell className="text-xs" style={{ color: "var(--brand-primary)" }}>{r.title ?? "—"}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{formatCurrency(r.contract)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{formatCurrency(r.actual_cost)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{formatCurrency(r.earned)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{formatCurrency(r.billed)}</TableCell>
                    <TableCell className={cn("text-right text-xs font-semibold tabular-nums", r.over_under > 0 ? "text-red-600" : r.over_under < 0 ? "text-emerald-600" : "text-muted-foreground")}>
                      {formatCurrency(r.over_under)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 border-t-[var(--border)]">
                  <TableCell className="text-xs font-semibold" colSpan={6}>Net over/(under)-billing</TableCell>
                  <TableCell className="text-right text-xs font-semibold tabular-nums">{formatCurrency(portfolio.totals.net)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
