"use client";

// PROJ-1b — lean /projects list over REAL data only. Renders ProjectListRow
// directly (no mock Project view-model): P-number, title, client, site, opco,
// status, created. Columns/stats/filters that needed un-modelled fields
// (manager, systems, budget, progress, dates) were dropped — they return as the
// job-costing / scheduling / services slices land.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Search, X } from "lucide-react";
import { format, parseISO } from "date-fns";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
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
import { listProjectsAction } from "./actions";
import type { ProjectListRow } from "@/lib/api/projects";

const OPCO_LABEL: Record<string, string> = {
  integrated_solutions: "Integrated",
  guardian: "Guardian",
};

export default function ProjectsListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ProjectListRow[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("All");

  useEffect(() => {
    let active = true;
    listProjectsAction()
      .then((data) => {
        if (active) setRows(data);
      })
      .catch(() => {
        /* leave empty */
      });
    return () => {
      active = false;
    };
  }, []);

  // Status options come from the data (only 'active' exists today).
  const statuses = useMemo(
    () => [...new Set(rows.map((r) => r.status))].sort(),
    [rows]
  );

  // Count-based stats: total + per-status breakdown.
  const byStatus = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.status, (m.get(r.status) ?? 0) + 1);
    return [...m.entries()].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "All" && r.status !== status) return false;
      if (q) {
        const hay = `${r.project_number} ${r.title ?? ""} ${
          r.client_name ?? ""
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, status]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${rows.length} project${rows.length === 1 ? "" : "s"}`}
        title="Projects"
        description="Active installations, service contracts, and commissioning."
        actions={
          <Link
            href="/quotes/new"
            className="inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-[12px] font-medium tracking-wide text-white shadow-sm transition-shadow hover:shadow-md"
            style={{ background: "var(--brand-primary)" }}
          >
            <Plus className="h-4 w-4" />
            New Project
          </Link>
        }
      />

      {/* Count-based stats */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="bg-card inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs shadow-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="text-brand-navy font-semibold tabular-nums">
            {rows.length}
          </span>
        </span>
        {byStatus.map(([s, n]) => (
          <span
            key={s}
            className="bg-card inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs shadow-sm"
          >
            <span className="text-muted-foreground capitalize">{s}</span>
            <span className="text-brand-charcoal font-semibold tabular-nums">
              {n}
            </span>
          </span>
        ))}
      </div>

      {/* Filters: status + text search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="text-muted-foreground absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search P-number, title, client…"
            className="h-8 pl-8 text-xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-muted-foreground hover:text-brand-charcoal absolute right-2 top-1/2 -translate-y-1/2"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v ?? "All")}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All statuses</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground ml-auto text-xs">
          Showing{" "}
          <span className="text-brand-charcoal font-semibold">
            {filtered.length}
          </span>{" "}
          of {rows.length}
        </p>
      </div>

      <Card className="bg-card overflow-hidden p-0 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project #</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Site</TableHead>
              <TableHead>Opco</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-muted-foreground py-8 text-center text-sm"
                >
                  {rows.length === 0
                    ? "No projects yet. Convert an approved quote to create one."
                    : "No projects match your filters."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow
                  key={r.id}
                  onClick={() => router.push(`/projects/${r.id}`)}
                  className="cursor-pointer"
                >
                  <TableCell className="text-brand-navy font-mono text-xs font-semibold">
                    {r.project_number}
                  </TableCell>
                  <TableCell className="text-brand-charcoal max-w-[240px] truncate text-sm">
                    {r.title || "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.client_deleted ? (
                      // POLISH-57 — parent client archived; flag it (not clickable).
                      <span className="italic text-zinc-400">
                        {r.client_name ?? "—"} (deleted)
                      </span>
                    ) : (
                      (r.client_name ?? "—")
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {r.site_deleted ? (
                      // POLISH-46 — site archived; keep the row, flag the site.
                      <span className="italic text-zinc-400">
                        {r.site_name ?? "—"} (deleted)
                      </span>
                    ) : (
                      (r.site_name ?? "—")
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="bg-muted text-brand-primary rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest">
                      {OPCO_LABEL[r.opco] ?? r.opco}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="rounded-full bg-[color-mix(in_oklab,var(--brand-status-green)_18%,transparent)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--brand-status-green)] capitalize">
                      {r.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs tabular-nums">
                    {format(parseISO(r.created_at), "MMM d, yyyy")}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
