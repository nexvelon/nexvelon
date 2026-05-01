"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LayoutGrid, List, Plus } from "lucide-react";
import { toast } from "sonner";
import { parseISO } from "date-fns";
import type { SortingState } from "@tanstack/react-table";

import { ProjectStatsStrip } from "@/components/modules/projects/ProjectStatsStrip";
import {
  ProjectFilters,
  EMPTY_PROJECT_FILTERS,
  type ProjectFilterValue,
} from "@/components/modules/projects/ProjectFilters";
import { ProjectsTable } from "@/components/modules/projects/ProjectsTable";
import { ProjectsCardView } from "@/components/modules/projects/ProjectsCardView";

import { projects as ALL_PROJECTS } from "@/lib/mock-data/projects";
import { clients as ALL_CLIENTS } from "@/lib/mock-data/clients";
import { users as ALL_USERS } from "@/lib/mock-data/users";
import { projectStats } from "@/lib/project-data";
import { cn } from "@/lib/utils";
import type { Project, ProjectStatus } from "@/lib/types";

export default function ProjectsListPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<ProjectFilterValue>(EMPTY_PROJECT_FILTERS);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "startDate", desc: true },
  ]);
  const [view, setView] = useState<"list" | "card">("list");

  const stats = useMemo(() => projectStats(), []);

  const pms = useMemo(
    () =>
      ALL_USERS.filter(
        (u) => u.role === "ProjectManager" || u.role === "Admin"
      ),
    []
  );

  const counts = useMemo(() => {
    const c: Record<"All" | ProjectStatus, number> = {
      All: ALL_PROJECTS.length,
      Planning: 0,
      Scheduled: 0,
      "In Progress": 0,
      "On Hold": 0,
      "At Risk": 0,
      Commissioning: 0,
      Completed: 0,
      Closed: 0,
    };
    for (const p of ALL_PROJECTS) c[p.status] += 1;
    return c;
  }, []);

  const filtered = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    const from = filters.fromDate ? parseISO(filters.fromDate).getTime() : -Infinity;
    const to = filters.toDate
      ? parseISO(filters.toDate).getTime() + 24 * 60 * 60 * 1000 - 1
      : Infinity;

    return ALL_PROJECTS.filter((p) => {
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
  }, [filters]);

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

  const handlers = {
    onView: (p: Project) => router.push(`/projects/${p.id}`),
    onDuplicate: (p: Project) =>
      toast(`Duplicating ${p.code}`, {
        description: "Demo: a real build would clone this project as Planning.",
      }),
    onArchive: (p: Project) =>
      toast(`Archived ${p.code}`, {
        description: "Demo: archive is a soft action.",
      }),
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-brand-navy font-serif text-3xl">Projects</h1>
          <p className="text-brand-charcoal/70 mt-1 text-sm">
            Active installations, service contracts, and commissioning.
          </p>
        </div>
        <Link
          href="/quotes/new"
          className="bg-brand-navy hover:bg-brand-navy/90 border-brand-gold/60 inline-flex items-center gap-2 rounded-md border-2 px-4 py-2 text-sm text-white shadow-sm transition-shadow hover:shadow-md"
        >
          <Plus className="h-4 w-4" />
          <span className="font-serif tracking-wide">New Project</span>
        </Link>
      </header>

      <ProjectStatsStrip {...stats} />

      <ProjectFilters
        value={filters}
        onChange={setFilters}
        clients={ALL_CLIENTS}
        pms={pms}
        counts={counts}
      />

      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs">
          Showing{" "}
          <span className="text-brand-charcoal font-semibold">
            {filtered.length}
          </span>{" "}
          of {ALL_PROJECTS.length} projects
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
          clients={ALL_CLIENTS}
          users={ALL_USERS}
          onView={handlers.onView}
          onDuplicate={handlers.onDuplicate}
          onArchive={handlers.onArchive}
          sorting={sorting}
          onSortingChange={setSorting}
        />
      ) : (
        <ProjectsCardView
          projects={sorted}
          clients={ALL_CLIENTS}
          users={ALL_USERS}
          onView={handlers.onView}
        />
      )}
    </div>
  );
}
