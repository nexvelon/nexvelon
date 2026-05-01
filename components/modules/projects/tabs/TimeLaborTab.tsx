"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { users } from "@/lib/mock-data/users";
import { buildTimeEntries, type TimeEntry } from "@/lib/project-data";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
  readOnly?: boolean;
}

export function TimeLaborTab({ project, readOnly }: Props) {
  const seed = useMemo(() => buildTimeEntries(project), [project]);
  const [entries, setEntries] = useState<TimeEntry[]>(seed);
  const [techFilter, setTechFilter] = useState<string>("all");
  const [billableFilter, setBillableFilter] = useState<"all" | "yes" | "no">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const userById = new Map(users.map((u) => [u.id, u]));

  const filtered = entries.filter((e) => {
    if (techFilter !== "all" && e.techId !== techFilter) return false;
    if (billableFilter === "yes" && !e.billable) return false;
    if (billableFilter === "no" && e.billable) return false;
    if (from && e.date < from) return false;
    if (to && e.date > to) return false;
    return true;
  });

  const totalHours = filtered.reduce((s, e) => s + e.hours, 0);
  const billableHours = filtered.filter((e) => e.billable).reduce((s, e) => s + e.hours, 0);
  const laborCost = filtered.reduce((s, e) => s + e.hours * e.costRate, 0);
  const laborRevenue = filtered
    .filter((e) => e.billable)
    .reduce((s, e) => s + e.hours * e.billRate, 0);
  const margin = laborRevenue === 0 ? 0 : (laborRevenue - laborCost) / laborRevenue;

  const techsOnProject = Array.from(new Set(entries.map((e) => e.techId)))
    .map((id) => userById.get(id))
    .filter(Boolean) as (typeof users)[number][];

  const logTime = () => {
    if (readOnly) return;
    const tech = techsOnProject[0] ?? users[0];
    const fresh: TimeEntry = {
      id: `te-${project.id}-new-${Date.now()}`,
      projectId: project.id,
      techId: tech.id,
      date: new Date().toISOString().slice(0, 10),
      hours: 4,
      task: "On-site work",
      billable: true,
      costRate: tech.role === "ProjectManager" ? 95 : 78,
      billRate: 145,
    };
    setEntries((prev) => [fresh, ...prev]);
    toast.success("Time entry added");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="font-serif text-lg">Time entries</CardTitle>
          <Button size="sm" disabled={readOnly} onClick={logTime}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Log Time
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-3">
              <Select value={techFilter} onValueChange={(v) => setTechFilter(v ?? "all")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All technicians</SelectItem>
                  {techsOnProject.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} · {u.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Select
                value={billableFilter}
                onValueChange={(v) => setBillableFilter((v ?? "all") as "all" | "yes" | "no")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="yes">Billable only</SelectItem>
                  <SelectItem value="no">Non-billable</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-3">
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                placeholder="From"
              />
            </div>
            <div className="md:col-span-3">
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="To"
              />
            </div>
          </div>

          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] uppercase">Tech</TableHead>
                  <TableHead className="text-[11px] uppercase">Date</TableHead>
                  <TableHead className="text-right text-[11px] uppercase">Hours</TableHead>
                  <TableHead className="text-[11px] uppercase">Task</TableHead>
                  <TableHead className="text-[11px] uppercase">Billable</TableHead>
                  <TableHead className="text-right text-[11px] uppercase">Cost rate</TableHead>
                  <TableHead className="text-right text-[11px] uppercase">Bill rate</TableHead>
                  <TableHead className="text-right text-[11px] uppercase">Cost</TableHead>
                  <TableHead className="text-right text-[11px] uppercase">Bill</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-muted-foreground py-6 text-center text-xs"
                    >
                      No time entries match the current filters.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((e) => {
                  const u = userById.get(e.techId);
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs">{u?.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs tabular-nums">
                        {format(parseISO(e.date), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {e.hours}h
                      </TableCell>
                      <TableCell className="max-w-[280px] text-xs">{e.task}</TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-medium",
                            e.billable
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          )}
                        >
                          {e.billable ? "Yes" : "No"}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                        {formatCurrency(e.costRate)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                        {formatCurrency(e.billRate)}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {formatCurrency(e.hours * e.costRate)}
                      </TableCell>
                      <TableCell className="text-brand-navy text-right text-xs font-semibold tabular-nums">
                        {e.billable ? formatCurrency(e.hours * e.billRate) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-serif text-lg">Labor summary</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Stat label="Total hours" value={`${formatNumber(totalHours)}h`} />
          <Stat label="Billable hours" value={`${formatNumber(billableHours)}h`} />
          <Stat label="Labor cost" value={formatCurrency(laborCost)} />
          <Stat label="Labor revenue" value={formatCurrency(laborRevenue)} />
          <Stat
            label="Margin"
            value={`${(margin * 100).toFixed(1)}%`}
            tone={margin >= 0.4 ? "good" : margin >= 0.25 ? "default" : "bad"}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "default";
}) {
  return (
    <div>
      <p className="text-muted-foreground text-[10px] uppercase tracking-wider">
        {label}
      </p>
      <p
        className={cn(
          "font-serif text-lg tabular-nums",
          tone === "good" && "text-emerald-600",
          tone === "bad" && "text-red-600",
          (!tone || tone === "default") && "text-brand-navy"
        )}
      >
        {value}
      </p>
    </div>
  );
}
