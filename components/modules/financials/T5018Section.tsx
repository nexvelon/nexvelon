"use client";

// SUB-7 — the T5018 (Statement of Contract Payments) section on the Tax tab,
// alongside the FIN-7 HST net position (both are CRA filings). Year picker +
// per-sub totals + CSV export. financials:edit only — the parent gates, and the
// actions gate again server-side. A bookkeeping aid, not tax advice.

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getT5018ReportAction,
  getT5018YearsAction,
  exportT5018CsvAction,
} from "@/app/(app)/financials/actions";
import type { T5018Report } from "@/lib/api/t5018";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export function T5018Section() {
  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [report, setReport] = useState<T5018Report | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    getT5018YearsAction().then((res) => {
      if (!res.ok) return;
      setYears(res.data);
      if (res.data.length === 0) return;
      // Default to the last COMPLETED calendar year (that's what you file);
      // fall back to the newest year with activity.
      const lastCompleted = new Date().getFullYear() - 1;
      setYear(res.data.includes(lastCompleted) ? lastCompleted : res.data[0]);
    });
  }, []);

  useEffect(() => {
    if (year == null) return;
    getT5018ReportAction(year).then((res) => {
      if (res.ok) setReport(res.data);
    });
  }, [year]);

  const handleExport = async () => {
    if (year == null) return;
    setExporting(true);
    try {
      const res = await exportT5018CsvAction(year);
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
      toast.success("T5018 report exported");
    } finally {
      setExporting(false);
    }
  };

  if (years.length === 0) return null; // no sub payment activity yet — nothing to file

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-brand-navy font-serif text-lg">
          T5018 — Contract payments to subcontractors
        </h3>
        <Select
          value={year == null ? undefined : String(year)}
          onValueChange={(v) => v && setYear(Number(v))}
        >
          <SelectTrigger className="h-8 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)} className="text-xs">
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={handleExport}
          disabled={exporting || !report || report.rows.length === 0}
          className="ml-auto"
        >
          <Download className="mr-1 h-3.5 w-3.5" />
          Export T5018 (CSV)
        </Button>
      </div>

      {report && (
        <>
          {/* Summary strip */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1">
              Subcontractors{" "}
              <span className="text-brand-charcoal font-semibold tabular-nums">
                {report.totals.subcontractor_count}
              </span>
            </span>
            <span className="text-muted-foreground inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1">
              Total paid{" "}
              <span className="text-brand-navy font-semibold tabular-nums">
                {formatCurrency(report.totals.total_paid)}
              </span>
            </span>
            {report.totals.rows_missing_business_number > 0 && (
              <span className="text-destructive border-destructive/40 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium">
                {report.totals.rows_missing_business_number} missing business number
              </span>
            )}
            <span className="text-muted-foreground ml-auto text-[11px]">
              {report.period.from} → {report.period.to}
            </span>
          </div>

          <Card className="p-0 shadow-sm">
            {report.rows.length === 0 ? (
              <p className="text-muted-foreground p-6 text-center text-sm">
                No subcontractor payments in {report.year}.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[11px] uppercase">Legal name</TableHead>
                      <TableHead className="text-[11px] uppercase">Business number</TableHead>
                      <TableHead className="text-right text-[11px] uppercase">Total paid</TableHead>
                      <TableHead className="text-right text-[11px] uppercase">Payments</TableHead>
                      <TableHead className="text-[11px] uppercase">Flags</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.rows.map((r) => (
                      <TableRow key={r.subcontractor_id}>
                        <TableCell className="text-brand-charcoal text-xs font-medium">
                          {r.name}
                        </TableCell>
                        <TableCell className={cn("font-mono text-xs", !r.business_number && "text-muted-foreground")}>
                          {r.business_number ?? "—"}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold tabular-nums">
                          {formatCurrency(r.total_paid)}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {r.payment_count}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {r.missing_business_number && (
                              <span className="text-destructive border-destructive/40 inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-medium">
                                Missing BN
                              </span>
                            )}
                            {r.below_threshold && (
                              <span className="text-muted-foreground inline-flex rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10px]">
                                Below $500
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          <p className="text-muted-foreground text-[11px]">
            T5018 slips report contract payments made during the calendar year,
            including GST/HST. This is a bookkeeping aid — confirm filing
            requirements and deadlines with your accountant before submitting to
            CRA.
          </p>
        </>
      )}
    </div>
  );
}
