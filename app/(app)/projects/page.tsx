"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LayoutGrid, List, Plus } from "lucide-react";
import { parseISO } from "date-fns";
import type { SortingState } from "@tanstack/react-table";

import { PageHeader } from "@/components/layout/PageHeader";
import { ProjectStatsStrip } from "@/components/modules/projects/ProjectStatsStrip";
import {
  ProjectFilters,
  EMPTY_PROJECT_FILTERS,
  type ProjectFilterValue,
} from "@/components/modules/projects/ProjectFilters";
import { ProjectsTable } from "@/components/modules/projects/ProjectsTable";
import { ProjectsCardView } from "@/components/modules/projects/ProjectsCardView";

import { listProjectsAction } from "./actions";
import type { ProjectListRow } from "@/lib/api/projects";
import { cn } from "@/lib/utils";
import type { Client, Project, ProjectStatus, User } from "@/lib/types";

// PROJ-1: real DbProject status → the mock ProjectStatus view-model. Only
// 'active' exists today; richer lifecycle statuses arrive with later slices.
const STATUS_MAP: Record<string, ProjectStatus> = {
  active: "In Progress",
};

// PROJ-1: real DbProject (rolled up with client/site names) → the existing
// Project view-model. Fields the domain doesn't model yet (manager, systems,
// budget/progress, dates) are placeholders until those slices land.
function dbToProject(r: ProjectListRow): Project {
  return {
    id: r.id,
    code: r.project_number,
    name: r.title || r.project_number,
    clientId: r.client_id,
    siteId: r.site_id ?? undefined,
    status: STATUS_MAP[r.status] ?? "In Progress",
    startDate: r.created_at,
    targetDate: r.created_at,
    managerId: "",
    systemTypes: [],
    budget: 0,
    spent: 0,
    progress: 0,
    description: "",
    quoteId: r.originating_quote_id ?? undefined,
  };
}

export default function ProjectsListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ProjectListRow[]>([]);
  const [filters, setFilters] = useState<ProjectFilterValue>(EMPTY_PROJECT_FILTERS);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "startDate", desc: true },
  ]);
  const [view, setView] = useState<"list" | "card">("list");

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

  const allProjects = useMemo(() => rows.map(dbToProject), [rows]);

  // Synthesize the client lookup the table/filters expect from the rolled-up
  // names (managerId is a placeholder for now, so users stays empty).
  const clients = useMemo<Client[]>(() => {
    const byId = new Map<string, Client>();
    for (const r of rows) {
      if (!byId.has(r.client_id)) {
        byId.set(r.client_id, {
          id: r.client_id,
          name: r.client_name ?? "—",
        } as Client);
      }
    }
    return [...byId.values()];
  }, [rows]);

  const stats = useMemo(
    () => ({
      active: allProjects.length,
      atRisk: 0,
      completedMTD: 0,
      totalBacklog: 0,
    }),
    [allProjects]
  );

  const counts = useMemo(() => {
    const c: Record<"All" | ProjectStatus, number> = {
      All: allProjects.length,
      Planning: 0,
      Scheduled: 0,
      "In Progress": 0,
      "On Hold": 0,
      "At Risk": 0,
      Commissioning: 0,
      Completed: 0,
      Closed: 0,
    };
    for (const p of allProjects) c[p.status] += 1;
    return c;
  }, [allProjects]);

  const filtered = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    const from = filters.fromDate ? parseISO(filters.fromDate).getTime() : -Infinity;
    const to = filters.toDate
      ? parseISO(filters.toDate).getTime() + 24 * 60 * 60 * 1000 - 1
      : Infinity;

    return allProjects.filter((p) => {
      if (filters.status !== "All" && p.status !== filters.status) return false;
      if (filters.clientId !== "all" && p.clientId !== filters.clientId) return false;
      if (filters.pmId !== "all" && p.managerId !== filters.pmId) return false;
      if (filters.systemType !== "All") {
        if (filters.systemType === "Mixed") {
          if (p.systemTypes.length < 2) return false;
        } else if (!p.systemTypes.includes(filters.systemType)) return false;
      }
      const t = parseISO(p.startDate).getTime();
      if (t < from || t > to) return false;
      if (search) {
        if (
          !p.code.toLowerCase().includes(search) &&
          !p.name.toLowerCase().includes(search)
        )
          return false;
      }
      return true;
    });
  }, [allProjects, filters]);

  const sorted = useMemo(() => {
    if (sorting.length === 0) return filtered;
    const [s] = sorting;
    const dir = s.desc ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[s.id];
      const bv = (b as unknown as Record<string, unknown>)[s.id];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
    });
  }, [filtered, sorting]);

  const noUsers: User[] = [];
  const onView = (p: Project) => router.push(`/projects/${p.id}`);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${allProjects.length} project${allProjects.length === 1 ? "" : "s"}`}
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

      <ProjectStatsStrip {...stats} />

      <ProjectFilters
        value={filters}
        onChange={setFilters}
        clients={clients}
        pms={noUsers}
        counts={counts}
      />

      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs">
          Showing{" "}
          <span className="text-brand-charcoal font-semibold">
            {filtered.length}
          </span>{" "}
          of {allProjects.length} projects
        </p>
        <div className="bg-muted inline-flex items-center rounded-md p-0.5">
          <button
            type="button"
            onClick={() => setView("list")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
              view === "list"
                ? "bg-card text-brand-navy shadow-sm"
                : "text-muted-foreground hover:text-brand-charcoal"
            )}
          >
            <List className="h-3.5 w-3.5" />
            List
          </button>
          <button
            type="button"
            onClick={() => setView("card")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
              view === "card"
                ? "bg-card text-brand-navy shadow-sm"
                : "text-muted-foreground hover:text-brand-charcoal"
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Cards
          </button>
        </div>
      </div>

      {view === "list" ? (
        <ProjectsTable
          projects={sorted}
          clients={clients}
          users={noUsers}
          onView={onView}
          onDuplicate={onView}
          onArchive={onView}
          sorting={sorting}
          onSortingChange={setSorting}
        />
      ) : (
        <ProjectsCardView
          projects={sorted}
          clients={clients}
          users={noUsers}
          onView={onView}
        />
      )}
    </div>
  );
}
