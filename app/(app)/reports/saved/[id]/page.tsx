"use client";

// REP-5 — one saved report: its filters (editable), Run now (download, with YOUR
// permissions), the email schedule + recipients, Send now, and the run history —
// every scheduled run with who received it, who was skipped and why (2f).

import { use, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Download, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/PageHeader";
import { SavedParamsEditor } from "@/components/reports/SavedParamsEditor";
import { downloadReport } from "@/lib/reports/download";
import { REPORT_CATALOG } from "@/lib/reports/catalog";
import { describeParams, resolveParams, type SavedReportParams } from "@/lib/reports/saved-params";
import {
  CADENCE_OPTIONS,
  WEEKDAYS,
  DEFAULT_PRESET_FOR_CADENCE,
  describeSchedule,
  nextOccurrence,
  type ReportCadence,
} from "@/lib/reports/schedule";
import { RANGE_PRESET_LABEL } from "@/lib/reports/date-ranges";
import { businessDateISO } from "@/lib/format";
import type { ReportFormat } from "@/lib/reports/export";
import type { SavedReportDetail } from "@/lib/api/saved-reports";
import {
  getSavedReportAction,
  updateSavedReportAction,
  deleteSavedReportAction,
  runSavedReportAction,
  saveScheduleAction,
  setScheduleActiveAction,
  deleteScheduleAction,
  sendSavedReportNowAction,
  listReportRecipientOptionsAction,
  type RecipientOption,
} from "@/app/(app)/reports/saved-actions";
import { cn } from "@/lib/utils";

const SELECT = "border-input bg-background h-8 rounded-md border px-2 text-xs";
const LABEL = "text-muted-foreground mb-1 block text-[11px] font-medium";
const RUN_TONE: Record<string, string> = {
  delivered: "text-[var(--brand-status-green)]",
  partial: "text-amber-700",
  failed: "text-destructive",
  skipped: "text-muted-foreground",
  running: "text-muted-foreground",
};

export default function SavedReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [detail, setDetail] = useState<SavedReportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<RecipientOption[]>([]);
  const [pending, start] = useTransition();

  // editable copies
  const [name, setName] = useState("");
  const [format, setFormat] = useState<ReportFormat>("pdf");
  const [p, setP] = useState<SavedReportParams>({});
  const [cadence, setCadence] = useState<ReportCadence>("monthly");
  const [dow, setDow] = useState(1);
  const [dom, setDom] = useState(1);
  const [startDate, setStartDate] = useState(businessDateISO());
  const [recipients, setRecipients] = useState<string[]>([]);
  const [pick, setPick] = useState("");

  const load = useCallback(() => {
    getSavedReportAction(id).then((r) => {
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const d = r.data;
      setDetail(d);
      setName(d.report.name);
      setFormat(d.report.format);
      setP(d.report.params ?? {});
      if (d.schedule) {
        setCadence(d.schedule.cadence);
        setDow(d.schedule.day_of_week ?? 1);
        setDom(d.schedule.day_of_month ?? 1);
        setStartDate(d.schedule.start_date);
      }
      setRecipients(d.recipients.map((x) => x.user_id));
    });
  }, [id]);

  useEffect(() => {
    load();
    listReportRecipientOptionsAction().then((r) => r.ok && setOptions(r.data));
  }, [load]);

  const key = detail?.report.report_key;
  const entry = key ? REPORT_CATALOG[key] : null;
  const preview = useMemo(() => (key ? resolveParams(key, p, businessDateISO()) : null), [key, p]);
  // Warn when a period report's range doesn't match the cadence ("this month" on the 1st = one day).
  const rangeWarning = useMemo(() => {
    if (!entry || entry.params !== "range") return null;
    const r = p.range;
    if (!r || r.kind === "none") return null;
    if (r.kind === "fixed") return "Fixed dates: every scheduled run will report exactly these dates.";
    const want = DEFAULT_PRESET_FOR_CADENCE[cadence];
    if (r.preset !== want) {
      return `A ${cadence} schedule usually reports “${RANGE_PRESET_LABEL[want]}” (the period that just closed). This one reports “${RANGE_PRESET_LABEL[r.preset]}”.`;
    }
    return null;
  }, [entry, p.range, cadence]);

  if (error) {
    return (
      <div className="mx-auto max-w-md py-16">
        <Card className="bg-card p-8 text-center shadow-sm">
          <p className="text-destructive text-sm">{error}</p>
          <Link href="/reports/saved" className="mt-3 inline-block text-sm underline">
            ← Saved reports
          </Link>
        </Card>
      </div>
    );
  }
  if (!detail || !key || !entry) {
    return (
      <Card className="bg-card p-6 shadow-sm">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </Card>
    );
  }

  const saveReport = () =>
    start(async () => {
      const r = await updateSavedReportAction(id, { name, params: p, format });
      if (r.ok) {
        toast.success("Saved");
        load();
      } else toast.error(r.error);
    });

  const runNow = () =>
    start(async () => {
      const r = await runSavedReportAction(id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.data.rowCount === 0) toast("This report has no data for the period — the file has headers only.");
      downloadReport(r.data);
    });

  const saveSchedule = () =>
    start(async () => {
      const r = await saveScheduleAction(id, {
        cadence,
        dayOfWeek: cadence === "weekly" ? dow : null,
        dayOfMonth: cadence === "monthly" || cadence === "quarterly" ? dom : null,
        startDate,
        recipientIds: recipients,
      });
      if (!r.ok) {
        toast.error("Couldn't save the schedule", { description: r.error });
        return;
      }
      toast.success("Schedule saved", {
        description: r.data.ownerChanged ? "You're now the owner — it runs with your permissions." : undefined,
      });
      load();
    });

  const sendNow = () =>
    start(async () => {
      const r = await sendSavedReportNowAction(id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.data.failed > 0) toast.error("Not sent", { description: r.data.errors.join(" ") });
      else toast.success(`Sent to ${r.data.emailsSent} recipient${r.data.emailsSent === 1 ? "" : "s"}`);
      load();
    });

  const toggleActive = (active: boolean) =>
    start(async () => {
      const r = await setScheduleActiveAction(id, active);
      if (r.ok) {
        toast.success(active ? "Schedule resumed" : "Schedule paused");
        load();
      } else toast.error(r.error);
    });

  const removeSchedule = () =>
    start(async () => {
      const r = await deleteScheduleAction(id);
      if (r.ok) {
        toast.success("Schedule removed");
        load();
      } else toast.error(r.error);
    });

  const removeReport = () =>
    start(async () => {
      if (!window.confirm("Delete this saved report? Its schedule stops; its delivery history is kept.")) return;
      const r = await deleteSavedReportAction(id);
      if (r.ok) {
        toast.success("Saved report deleted");
        router.push("/reports/saved");
      } else toast.error(r.error);
    });

  const sch = detail.schedule;
  const next = sch?.active ? nextOccurrence({ cadence: sch.cadence, dayOfWeek: sch.day_of_week, dayOfMonth: sch.day_of_month, startDate: sch.start_date }, businessDateISO()) : null;

  return (
    <div className="space-y-6">
      <Link href="/reports/saved" className="text-muted-foreground hover:text-brand-charcoal inline-flex items-center gap-1.5 text-[12px] font-medium">
        <ArrowLeft className="h-3.5 w-3.5" /> Saved reports
      </Link>
      <PageHeader
        eyebrow={entry.title}
        title={detail.report.name}
        description={`${describeParams(key, detail.report.params ?? {})} · owned by ${detail.report.owner_name ?? "—"}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={runNow} disabled={pending}>
              <Download className="mr-1 h-3.5 w-3.5" /> Run now
            </Button>
            <Button size="sm" variant="ghost" onClick={removeReport} disabled={pending}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        }
      />

      {sch && !sch.active && sch.paused_reason && (
        <Card className="border-destructive/40 p-4 text-sm shadow-sm">
          <p className="text-destructive flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-4 w-4" /> Schedule paused
          </p>
          <p className="text-muted-foreground mt-1 text-xs">{sch.paused_reason}</p>
          <Button size="sm" className="mt-2" onClick={() => toggleActive(true)} disabled={pending}>
            Resume (runs with your permissions)
          </Button>
        </Card>
      )}

      <Card className="bg-card space-y-3 p-4 shadow-sm">
        <h2 className="text-brand-navy font-serif text-lg">Report & filters</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="sd-name">Name</label>
            <Input id="sd-name" className="h-8 text-xs" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={LABEL} htmlFor="sd-format">File format</label>
            <select id="sd-format" className={SELECT} value={format} onChange={(e) => setFormat(e.target.value as ReportFormat)}>
              <option value="pdf">PDF</option>
              <option value="xlsx">Excel</option>
              <option value="csv">CSV</option>
            </select>
          </div>
        </div>
        <SavedParamsEditor reportKey={key} value={p} onChange={setP} />
        {preview && (preview.from || preview.year) && (
          <p className="text-muted-foreground text-xs">
            If it ran today it would cover: <strong>{preview.from ? `${preview.from} to ${preview.to}` : preview.year}</strong>
          </p>
        )}
        <Button size="sm" onClick={saveReport} disabled={pending}>
          Save changes
        </Button>
      </Card>

      <Card className="bg-card space-y-3 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-brand-navy font-serif text-lg">Email schedule</h2>
          {sch && (
            <span className="text-muted-foreground text-xs">
              {sch.active ? `${describeSchedule({ cadence: sch.cadence, dayOfWeek: sch.day_of_week, dayOfMonth: sch.day_of_month })} · next ${next ?? "—"}` : "Paused"}
            </span>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={LABEL} htmlFor="sd-cadence">How often</label>
            <select id="sd-cadence" className={SELECT} value={cadence} onChange={(e) => setCadence(e.target.value as ReportCadence)}>
              {CADENCE_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          {cadence === "weekly" && (
            <div>
              <label className={LABEL} htmlFor="sd-dow">Day</label>
              <select id="sd-dow" className={SELECT} value={dow} onChange={(e) => setDow(Number(e.target.value))}>
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i}>{d}</option>
                ))}
              </select>
            </div>
          )}
          {(cadence === "monthly" || cadence === "quarterly") && (
            <div>
              <label className={LABEL} htmlFor="sd-dom">Day of month</label>
              <Input id="sd-dom" type="number" min={1} max={28} className="h-8 w-24 text-xs" value={dom} onChange={(e) => setDom(Number(e.target.value))} />
            </div>
          )}
          <div>
            <label className={LABEL} htmlFor="sd-start">Starting</label>
            <Input id="sd-start" type="date" className="h-8 text-xs" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          Runs early each morning (about 1 AM Toronto time) on the scheduled day. Periods like “Last month” are
          worked out for that day — a monthly run on the 1st reports the month that just ended.
        </p>
        {rangeWarning && <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">{rangeWarning}</p>}

        <div>
          <span className={LABEL}>Recipients (Nexvelon users)</span>
          <ul className="mb-2 space-y-1 text-xs">
            {recipients.length === 0 && <li className="text-muted-foreground">None yet.</li>}
            {recipients.map((rid) => {
              const o = options.find((x) => x.id === rid) ?? detail.recipients.find((x) => x.user_id === rid);
              const label = o ? ("name" in o ? o.name : "") : rid;
              return (
                <li key={rid} className="flex items-center justify-between">
                  <span>{label}</span>
                  <button className="text-muted-foreground underline" onClick={() => setRecipients((r) => r.filter((x) => x !== rid))}>
                    remove
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2">
            <select className={SELECT} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Add a person…</option>
              {options
                .filter((o) => !recipients.includes(o.id))
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.role})
                  </option>
                ))}
            </select>
            <Button size="sm" variant="outline" disabled={!pick} onClick={() => { setRecipients((r) => [...r, pick]); setPick(""); }}>
              Add
            </Button>
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">
            Each person gets their own copy, generated with their own permissions — someone who couldn&apos;t open this
            report can&apos;t be added, and is skipped if they later lose access. Sending to anyone but yourself needs
            permission to distribute reports.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={saveSchedule} disabled={pending || recipients.length === 0}>
            {sch ? "Save schedule" : "Create schedule"}
          </Button>
          {sch && (
            <>
              <Button size="sm" variant="outline" onClick={sendNow} disabled={pending}>
                <Send className="mr-1 h-3.5 w-3.5" /> Send now
              </Button>
              {sch.active ? (
                <Button size="sm" variant="outline" onClick={() => toggleActive(false)} disabled={pending}>Pause</Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => toggleActive(true)} disabled={pending}>Resume</Button>
              )}
              <Button size="sm" variant="ghost" onClick={removeSchedule} disabled={pending}>Remove schedule</Button>
            </>
          )}
        </div>
      </Card>

      <Card className="bg-card p-4 shadow-sm">
        <h2 className="text-brand-navy mb-2 font-serif text-lg">Delivery history</h2>
        {detail.runs.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing has been sent yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-[11px] uppercase">
                <th className="py-2">Run date</th>
                <th className="py-2">Result</th>
                <th className="py-2">Recipients</th>
              </tr>
            </thead>
            <tbody>
              {detail.runs.map((run) => (
                <tr key={run.id} className="border-b align-top last:border-0">
                  <td className="py-2 text-xs tabular-nums">
                    {run.run_date}
                    <span className="text-muted-foreground block">{run.trigger === "manual" ? "Sent now" : "Scheduled"}</span>
                  </td>
                  <td className="py-2 text-xs">
                    <span className={cn("font-medium capitalize", RUN_TONE[run.status])}>{run.status}</span>
                    {run.row_count === 0 && <span className="text-muted-foreground block">No data for this run</span>}
                    {run.error && <span className="text-muted-foreground block">{run.error}</span>}
                  </td>
                  <td className="py-2 text-xs">
                    {run.deliveries.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <ul>
                        {run.deliveries.map((d) => (
                          <li key={d.id}>
                            {d.email ?? "(removed user)"} —{" "}
                            <span className={d.status === "sent" ? "text-[var(--brand-status-green)]" : d.status === "failed" ? "text-destructive" : "text-muted-foreground"}>
                              {d.status}
                            </span>
                            {d.reason ? <span className="text-muted-foreground"> ({d.reason})</span> : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
