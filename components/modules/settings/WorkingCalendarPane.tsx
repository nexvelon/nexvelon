"use client";

// GANTT-CAL — Settings → Working Calendar. Admin-gated. Sets the org working
// weekdays + holiday list that drive scheduling (critical path, durations, resource
// capacity). Stored in company_settings; unset falls back to the seeded Mon–Fri +
// Ontario-holidays default (shown as "using the default" until saved, §2.8).

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  getWorkingCalendarAction,
  setWorkingCalendarAction,
} from "@/app/(app)/settings/company-settings-actions";

const WEEKDAYS = [
  { dow: 1, label: "Mon" },
  { dow: 2, label: "Tue" },
  { dow: 3, label: "Wed" },
  { dow: 4, label: "Thu" },
  { dow: 5, label: "Fri" },
  { dow: 6, label: "Sat" },
  { dow: 0, label: "Sun" },
];

export function WorkingCalendarPane() {
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [configured, setConfigured] = useState(false);
  const [newHoliday, setNewHoliday] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, start] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getWorkingCalendarAction();
    if (res.ok) {
      setWeekdays(res.data.config.workingWeekdays);
      setHolidays(res.data.config.holidays);
      setConfigured(res.data.configured);
    } else {
      toast.error(res.error);
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  function toggleDay(dow: number) {
    setWeekdays((cur) => (cur.includes(dow) ? cur.filter((d) => d !== dow) : [...cur, dow].sort()));
  }
  function addHoliday() {
    const h = newHoliday.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(h)) {
      toast.error("Pick a valid date.");
      return;
    }
    setHolidays((cur) => (cur.includes(h) ? cur : [...cur, h].sort()));
    setNewHoliday("");
  }

  function save() {
    if (weekdays.length === 0) {
      toast.error("Pick at least one working weekday.");
      return;
    }
    start(async () => {
      const res = await setWorkingCalendarAction({ workingWeekdays: weekdays, holidays });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setWeekdays(res.data.workingWeekdays);
      setHolidays(res.data.holidays);
      setConfigured(true);
      toast.success("Working calendar saved");
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-brand-navy font-serif text-lg">Working Calendar</h2>
        <p className="text-muted-foreground text-sm">
          The company’s working days and holidays. Project schedules — durations, the
          critical path, and resource capacity — skip non-working days.
          {!configured && !loading && (
            <span className="ml-1 italic">Currently using the default (Mon–Fri + Ontario statutory holidays).</span>
          )}
        </p>
      </div>

      <Card className="bg-card max-w-md space-y-5 p-4 shadow-sm">
        <div>
          <Label>Working weekdays</Label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d) => {
              const on = weekdays.includes(d.dow);
              return (
                <button
                  key={d.dow}
                  type="button"
                  onClick={() => toggleDay(d.dow)}
                  disabled={loading || pending}
                  aria-pressed={on}
                  className={`rounded-md border px-2.5 py-1 text-xs ${on ? "bg-brand-navy text-white" : "text-muted-foreground"}`}
                  style={{ borderColor: "var(--brand-border)" }}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Label>Holidays</Label>
          <div className="mt-2 flex items-center gap-1.5">
            <Input type="date" value={newHoliday} onChange={(e) => setNewHoliday(e.target.value)} disabled={loading || pending} className="max-w-[11rem]" />
            <Button type="button" variant="outline" size="sm" onClick={addHoliday} disabled={loading || pending} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
          {holidays.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {holidays.map((h) => (
                <li key={h} className="text-brand-charcoal inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs tabular-nums" style={{ borderColor: "var(--brand-border)" }}>
                  {h}
                  <button type="button" aria-label={`Remove ${h}`} onClick={() => setHolidays((cur) => cur.filter((x) => x !== h))} disabled={pending} className="text-muted-foreground hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground mt-2 text-xs">No holidays set.</p>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={loading || pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
