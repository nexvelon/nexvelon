"use client";

// REP-2 — the shared report view. Given a ReportDataset it renders the
// columns / rows / totals through the SAME formatCell the export renderers use
// (so the screen matches the file), plus the three export buttons. Every
// financial report view is a thin wrapper around this. An empty dataset shows a
// headers-only table with a calm note — never an error.

import { FileSpreadsheet, FileText, Sheet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatCell, defaultAlign, type ReportDataset } from "@/lib/reports/dataset";
import type { ReportFormat } from "@/lib/reports/export";
import { cn } from "@/lib/utils";

function alignClass(a: "left" | "right" | "center"): string {
  return a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";
}

export function ReportView({
  dataset,
  exporting,
  onExport,
  controls,
}: {
  dataset: ReportDataset;
  exporting: boolean;
  onExport: (format: ReportFormat) => void;
  /** Optional period/year picker, rendered above the table. */
  controls?: React.ReactNode;
}) {
  const { columns, rows, totals, meta } = dataset;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          {controls}
          {meta && meta.length > 0 && (
            <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
              {meta.map((m) => (
                <span key={m.label}>
                  <span className="uppercase tracking-wide">{m.label}:</span> {m.value}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" disabled={exporting} onClick={() => onExport("csv")}>
            <FileText className="mr-1 h-3.5 w-3.5" /> CSV
          </Button>
          <Button size="sm" variant="outline" disabled={exporting} onClick={() => onExport("xlsx")}>
            <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Excel
          </Button>
          <Button size="sm" variant="outline" disabled={exporting} onClick={() => onExport("pdf")}>
            <Sheet className="mr-1 h-3.5 w-3.5" /> PDF
          </Button>
        </div>
      </div>

      <Card className="bg-card overflow-hidden p-0 shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c.key} className={cn("text-[11px] uppercase", alignClass(defaultAlign(c)))}>
                    {c.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-muted-foreground py-8 text-center text-xs">
                    No data for this report yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, i) => (
                  <TableRow key={i}>
                    {columns.map((c) => (
                      <TableCell key={c.key} className={cn("text-xs tabular-nums", alignClass(defaultAlign(c)))}>
                        {formatCell(row[c.key], c.kind)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
              {totals && rows.length > 0 && (
                <TableRow className="border-t-2 border-t-[var(--border)] font-semibold">
                  {columns.map((c) => (
                    <TableCell key={c.key} className={cn("text-xs tabular-nums", alignClass(defaultAlign(c)))}>
                      {formatCell(totals[c.key] ?? "", c.kind)}
                    </TableCell>
                  ))}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
