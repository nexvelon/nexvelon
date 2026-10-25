"use client";

// REP-5 — edit a saved report's parameters (2b). The date range is a choice
// between a RELATIVE period ("Last month" — recomputed every run) and FIXED dates
// (the same dates every run), and the editor says which one it is in words, so
// nobody schedules "last month" by accident as frozen dates.

import { Input } from "@/components/ui/input";
import { REPORT_CATALOG, OPCO_FILTER_OPTIONS, type SavedReportKey } from "@/lib/reports/catalog";
import { RANGE_PRESETS, type RangePreset, type RangeSpec } from "@/lib/reports/date-ranges";
import type { SavedReportParams } from "@/lib/reports/saved-params";

const SELECT = "border-input bg-background h-8 rounded-md border px-2 text-xs";
const LABEL = "text-muted-foreground mb-1 block text-[11px] font-medium";

export function SavedParamsEditor({
  reportKey,
  value,
  onChange,
}: {
  reportKey: SavedReportKey;
  value: SavedReportParams;
  onChange: (next: SavedReportParams) => void;
}) {
  const entry = REPORT_CATALOG[reportKey];
  const range: RangeSpec = value.range ?? { kind: "none" };
  const setRange = (r: RangeSpec) => onChange({ ...value, range: r });

  return (
    <div className="space-y-3 text-xs">
      {entry.params === "range" && (
        <div className="space-y-2">
          <span className={LABEL}>Period</span>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={range.kind === "relative"}
                onChange={() => setRange({ kind: "relative", preset: "last_month" })}
              />
              Relative (recalculated every run)
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={range.kind === "fixed"}
                onChange={() =>
                  setRange({
                    kind: "fixed",
                    from: range.kind === "fixed" ? range.from : "",
                    to: range.kind === "fixed" ? range.to : "",
                  })
                }
              />
              Fixed dates
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={range.kind === "none"} onChange={() => setRange({ kind: "none" })} />
              All time / report default
            </label>
          </div>
          {range.kind === "relative" && (
            <select
              className={SELECT}
              value={range.preset}
              onChange={(e) => setRange({ kind: "relative", preset: e.target.value as RangePreset })}
            >
              {RANGE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
          {range.kind === "fixed" && (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                className="h-8 w-40 text-xs"
                value={range.from}
                onChange={(e) => setRange({ ...range, from: e.target.value })}
              />
              <span>to</span>
              <Input
                type="date"
                className="h-8 w-40 text-xs"
                value={range.to}
                onChange={(e) => setRange({ ...range, to: e.target.value })}
              />
              <span className="text-amber-800">Every run reports these exact dates.</span>
            </div>
          )}
        </div>
      )}

      {entry.params === "year" && (
        <div>
          <span className={LABEL}>Reporting year</span>
          <select
            className={SELECT}
            value={value.year?.kind === "fixed" ? String(value.year.year) : value.year?.preset ?? "this_year"}
            onChange={(e) => {
              const v = e.target.value;
              onChange({
                ...value,
                year:
                  v === "this_year" || v === "last_year"
                    ? { kind: "relative", preset: v }
                    : { kind: "fixed", year: Number(v) },
              });
            }}
          >
            <option value="this_year">This year (recalculated every run)</option>
            <option value="last_year">Last year (recalculated every run)</option>
            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => (
              <option key={y} value={y}>
                {y} (fixed)
              </option>
            ))}
          </select>
        </div>
      )}

      {entry.limit && (
        <div>
          <label className={LABEL} htmlFor="sp-limit">
            Top N vendors
          </label>
          <Input
            id="sp-limit"
            type="number"
            min={1}
            max={500}
            className="h-8 w-28 text-xs"
            placeholder="All"
            value={value.limit ?? ""}
            onChange={(e) => onChange({ ...value, limit: e.target.value === "" ? undefined : Number(e.target.value) })}
          />
        </div>
      )}

      {entry.opcoScoped && (
        <div>
          <span className={LABEL}>Company</span>
          <select
            className={SELECT}
            value={value.opco ?? ""}
            onChange={(e) => onChange({ ...value, opco: e.target.value || null })}
          >
            <option value="">Both companies (shown separately, never blended)</option>
            {OPCO_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} only
              </option>
            ))}
          </select>
        </div>
      )}

      {entry.pointInTime && (
        <p className="text-muted-foreground">
          This report shows balances <strong>as of the moment it runs</strong> — it has no period to choose.
        </p>
      )}
    </div>
  );
}
