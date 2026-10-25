"use client";

// REP-5 — "Save" on a report page: keeps the report + its filters as a saved
// report the user can re-run or schedule. Pre-fills from what's on screen — a
// period picked on screen is offered as FIXED dates (that's what was picked), with
// the relative choice one click away.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SavedParamsEditor } from "@/components/reports/SavedParamsEditor";
import { REPORT_CATALOG, type SavedReportKey } from "@/lib/reports/catalog";
import type { SavedReportParams } from "@/lib/reports/saved-params";
import type { ReportFormat } from "@/lib/reports/export";
import { createSavedReportAction } from "@/app/(app)/reports/saved-actions";

function seed(key: SavedReportKey, current: { from?: string; to?: string; year?: number; limit?: number }): SavedReportParams {
  const entry = REPORT_CATALOG[key];
  const p: SavedReportParams = {};
  if (entry.params === "range") {
    p.range = current.from && current.to ? { kind: "fixed", from: current.from, to: current.to } : { kind: "relative", preset: "last_month" };
  }
  if (entry.params === "year") {
    p.year = current.year ? { kind: "fixed", year: current.year } : { kind: "relative", preset: "this_year" };
  }
  if (entry.limit && current.limit) p.limit = current.limit;
  return p;
}

export function SaveReportButton({
  reportKey,
  current = {},
}: {
  reportKey: SavedReportKey;
  current?: { from?: string; to?: string; year?: number; limit?: number };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(REPORT_CATALOG[reportKey].title);
  const [format, setFormat] = useState<ReportFormat>("pdf");
  const [params, setParams] = useState<SavedReportParams>(() => seed(reportKey, current));
  const [pending, start] = useTransition();

  const openDialog = () => {
    setParams(seed(reportKey, current));
    setOpen(true);
  };

  const save = () =>
    start(async () => {
      const res = await createSavedReportAction({ name, reportKey, params, format });
      if (!res.ok) {
        toast.error("Couldn't save", { description: res.error });
        return;
      }
      setOpen(false);
      toast.success("Report saved", {
        description: "Open it from Saved reports to run it again or email it on a schedule.",
        action: { label: "Open", onClick: () => router.push(`/reports/saved/${res.data.id}`) },
      });
    });

  return (
    <>
      <Button size="sm" variant="outline" onClick={openDialog}>
        <Bookmark className="mr-1 h-3.5 w-3.5" /> Save
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif">Save this report</DialogTitle>
            <DialogDescription>
              Keep {REPORT_CATALOG[reportKey].title} with these filters to run again later — or schedule it by email
              from <Link className="underline" href="/reports/saved">Saved reports</Link>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-muted-foreground mb-1 block text-[11px] font-medium" htmlFor="sr-name">
                Name
              </label>
              <Input id="sr-name" className="h-8 text-xs" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <SavedParamsEditor reportKey={reportKey} value={params} onChange={setParams} />
            <div>
              <label className="text-muted-foreground mb-1 block text-[11px] font-medium" htmlFor="sr-format">
                File format (for downloads and emails)
              </label>
              <select
                id="sr-format"
                className="border-input bg-background h-8 rounded-md border px-2 text-xs"
                value={format}
                onChange={(e) => setFormat(e.target.value as ReportFormat)}
              >
                <option value="pdf">PDF</option>
                <option value="xlsx">Excel</option>
                <option value="csv">CSV</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending || !name.trim()}>
              {pending ? "Saving…" : "Save report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
