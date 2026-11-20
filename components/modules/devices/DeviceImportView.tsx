"use client";

// DEVREG-1 — import a device schedule (CSV, or the first sheet of an Excel file).
// Step 1: choose the site (and optionally the project) and a file. Step 2: a dry-
// run preview: every row with what will happen (create / update / unchanged /
// error) and why. Nothing is written until "Import". The server re-plans at commit
// time, so the result matches the database as it is then.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { parseCsv, templateCsv, REQUIRED_COLUMNS, TEMPLATE_COLUMNS, type ImportPlan, type PlannedAction } from "@/lib/devices/csv-import";
import { previewDeviceImportAction, commitDeviceImportAction } from "@/app/(app)/devices/actions";
import type { ImportOutcome } from "@/lib/api/devices";
import { FIELD_LABEL_CLS, SELECT_CLS, type ProjectOption, type SiteOption } from "./shared";

const ACTION_LABEL: Record<PlannedAction, string> = {
  create: "New device",
  update: "Update",
  unchanged: "No change",
  error: "Skipped (error)",
};
const ACTION_TONE: Record<PlannedAction, string> = {
  create: "bg-emerald-100 text-emerald-900",
  update: "bg-sky-100 text-sky-900",
  unchanged: "bg-muted text-muted-foreground",
  error: "bg-red-100 text-red-900",
};

async function readRows(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const width = ws.columnCount;
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      for (let c = 1; c <= width; c++) cells.push(row.getCell(c).text ?? "");
      rows.push(cells);
    });
    return rows.filter((r) => r.some((c) => c.trim() !== ""));
  }
  return parseCsv(await file.text());
}

export function DeviceImportView({
  sites,
  projects,
  initialSiteId,
}: {
  sites: SiteOption[];
  projects: ProjectOption[];
  initialSiteId: string;
}) {
  const router = useRouter();
  const [siteId, setSiteId] = useState(initialSiteId);
  const [projectId, setProjectId] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    setPlan(null);
    setOutcome(null);
    if (!file) return;
    try {
      const r = await readRows(file);
      setRows(r);
      setFileName(file.name);
    } catch (e) {
      toast.error(`Couldn't read that file: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function preview() {
    if (!rows || !siteId) return;
    setBusy(true);
    const res = await previewDeviceImportAction({ siteId, rows });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setPlan(res.data);
  }

  async function commit() {
    if (!rows || !siteId) return;
    setBusy(true);
    const res = await commitDeviceImportAction({ siteId, projectId: projectId || null, rows, fileName });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setOutcome(res.data);
    setPlan(res.data.plan);
    toast.success("Import finished.");
    router.refresh();
  }

  function downloadTemplate() {
    const blob = new Blob([templateCsv()], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Device schedule template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const siteProjects = projects.filter((p) => p.siteId === siteId);
  const writable = plan ? plan.counts.create + plan.counts.update : 0;

  return (
    <div className="space-y-6">
      <Link href={`/devices${siteId ? `?site=${siteId}` : ""}`} className="text-muted-foreground hover:text-brand-charcoal text-xs">
        ← Device Register
      </Link>
      <PageHeader
        eyebrow="Device Register"
        title="Import a device schedule"
        description="Load devices from a spreadsheet. You see exactly what will change before anything is saved."
        actions={
          <Button variant="outline" onClick={downloadTemplate}>
            Download template
          </Button>
        }
      />

      <Card className="bg-card space-y-4 p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className={FIELD_LABEL_CLS}>Site</label>
            <select
              className={SELECT_CLS}
              value={siteId}
              onChange={(e) => {
                setSiteId(e.target.value);
                setProjectId("");
                setPlan(null);
                setOutcome(null);
              }}
            >
              <option value="">Choose a site…</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.clientName ? ` (${s.clientName})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={FIELD_LABEL_CLS}>Project (optional)</label>
            <select className={SELECT_CLS} value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!siteId}>
              <option value="">No project</option>
              {siteProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <p className="text-muted-foreground mt-1 text-[11px]">New devices are recorded under this project. Existing devices keep theirs.</p>
          </div>
          <div>
            <label className={FIELD_LABEL_CLS}>File (.csv or .xlsx)</label>
            <input
              type="file"
              accept=".csv,.xlsx,text/csv"
              className="mt-2 block w-full text-sm"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          Required columns: <strong>{REQUIRED_COLUMNS.join(", ")}</strong>. Optional: {TEMPLATE_COLUMNS.filter((c) => !REQUIRED_COLUMNS.includes(c)).join(", ")}.
          A device is matched by building + label, so importing the same schedule again updates the devices already there
          instead of adding them twice. Blank cells never clear a value, and devices not in the file are left alone.
        </p>
        <div className="flex gap-2">
          <Button onClick={preview} disabled={!rows || !siteId || busy}>
            {busy && !plan ? "Checking…" : "Preview import"}
          </Button>
          {plan && !outcome && (
            <Button onClick={commit} disabled={busy || writable === 0}>
              {busy ? "Importing…" : `Import ${writable} row${writable === 1 ? "" : "s"}`}
            </Button>
          )}
        </div>
      </Card>

      {outcome && (
        <Card className="bg-card p-4 shadow-sm">
          <h2 className="text-brand-navy font-serif text-lg">Import finished</h2>
          <p className="mt-1 text-sm">
            {outcome.created} added · {outcome.updated} updated · {outcome.unchanged} unchanged · {outcome.skipped} skipped
            {outcome.failed.length > 0 ? ` · ${outcome.failed.length} refused by the database` : ""}
          </p>
          {outcome.failed.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm text-red-800">
              {outcome.failed.map((f) => (
                <li key={f.rowNumber}>
                  Row {f.rowNumber}: {f.error}
                </li>
              ))}
            </ul>
          )}
          <Link href={`/devices?site=${siteId}`} className="text-brand-gold mt-3 inline-block text-sm hover:underline">
            View the devices at this site →
          </Link>
        </Card>
      )}

      {plan && (
        <Card className="bg-card space-y-3 p-4 shadow-sm">
          <div className="flex flex-wrap gap-2 text-xs">
            {(Object.keys(ACTION_LABEL) as PlannedAction[]).map((a) => (
              <span key={a} className={`rounded px-2 py-1 ${ACTION_TONE[a]}`}>
                {ACTION_LABEL[a]}: {plan.counts[a]}
              </span>
            ))}
          </div>
          {plan.fileErrors.map((e) => (
            <p key={e} className="text-sm text-red-800">
              {e}
            </p>
          ))}
          {plan.unknownHeaders.length > 0 && (
            <p className="text-muted-foreground text-xs">Columns ignored (not recognised): {plan.unknownHeaders.join(", ")}.</p>
          )}
          {plan.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left">
                    {["Row", "Label", "Result", "Details"].map((h) => (
                      <th key={h} className="text-muted-foreground px-2 py-1.5 text-[11px] uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.map((r) => (
                    <tr key={r.rowNumber} className="border-b border-[var(--border)] align-top last:border-0">
                      <td className="px-2 py-1.5 tabular-nums">{r.rowNumber}</td>
                      <td className="px-2 py-1.5 font-medium">{r.label ?? "—"}</td>
                      <td className="px-2 py-1.5">
                        <span className={`rounded px-2 py-0.5 text-[11px] ${ACTION_TONE[r.action]}`}>{ACTION_LABEL[r.action]}</span>
                        {r.typeMatched === false && (
                          <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900">type unmatched</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-xs">
                        {r.errors.map((e) => (
                          <div key={e} className="text-red-800">
                            {e}
                          </div>
                        ))}
                        {r.warnings.map((w) => (
                          <div key={w} className="text-amber-800">
                            {w}
                          </div>
                        ))}
                        {r.action === "update" && (
                          <div className="text-muted-foreground">Changes: {Object.keys(r.changes).join(", ")}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
