"use client";

// REP-3 / REP-4 — the generic operational report page (the operational twin of
// FinancialReport). Fetches a report's dataset by key (gated server-side per
// resource), renders it through the shared ReportView, and wires the three
// export buttons to downloadReport. Optional renderControls for the period-aware
// reports (pipeline / utilization / vendor spend).

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReportView } from "@/components/reports/ReportView";
import { downloadReport } from "@/lib/reports/download";
import {
  getOperationalReportAction,
  exportOperationalReportAction,
  type OperationalReportKey,
  type OperationalReportParams,
} from "@/app/(app)/reports/operational-actions";
import type { ReportDataset } from "@/lib/reports/dataset";
import type { ReportFormat } from "@/lib/reports/export";

export interface OpReportControlsArgs {
  params: OperationalReportParams;
  setParams: (next: OperationalReportParams) => void;
  pending: boolean;
}

export function OperationalReport({
  reportKey,
  title,
  description,
  eyebrow = "Operational report",
  note,
  initialParams,
  renderControls,
}: {
  reportKey: OperationalReportKey;
  title: string;
  description: string;
  eyebrow?: string;
  /** Optional prominent caption (e.g. the snapshot's "not a valuation" note). */
  note?: string;
  initialParams?: OperationalReportParams;
  renderControls?: (args: OpReportControlsArgs) => React.ReactNode;
}) {
  const [dataset, setDataset] = useState<ReportDataset | null>(null);
  const [restricted, setRestricted] = useState(false);
  const [params, setParamsState] = useState<OperationalReportParams>(initialParams ?? {});
  const [loading, startLoad] = useTransition();
  const [exporting, startExport] = useTransition();

  const load = useCallback(
    (p: OperationalReportParams) => {
      startLoad(async () => {
        const res = await getOperationalReportAction({ reportKey, params: p });
        if (res.ok) {
          setDataset(res.data);
          setRestricted(false);
        } else {
          setRestricted(true);
        }
      });
    },
    [reportKey]
  );

  useEffect(() => {
    load(initialParams ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const setParams = (next: OperationalReportParams) => {
    setParamsState(next);
    load(next);
  };

  const doExport = (format: ReportFormat) =>
    startExport(async () => {
      const res = await exportOperationalReportAction({ reportKey, format, params });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
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
          <p className="text-muted-foreground mt-2 text-sm">You don&apos;t have permission to view this report.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/reports" className="text-muted-foreground hover:text-brand-charcoal inline-flex items-center gap-1.5 text-[12px] font-medium">
        <ArrowLeft className="h-3.5 w-3.5" /> Reports
      </Link>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      {note && (
        <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-[12px]" style={{ borderColor: "var(--brand-border)" }}>
          {note}
        </p>
      )}

      {!dataset ? (
        <Card className="bg-card p-6 shadow-sm">
          <p className="text-muted-foreground text-sm">Loading…</p>
        </Card>
      ) : (
        <ReportView
          dataset={dataset}
          exporting={exporting}
          onExport={doExport}
          controls={renderControls?.({ params, setParams, pending: loading })}
        />
      )}
    </div>
  );
}
