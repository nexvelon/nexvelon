"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { projects } from "@/lib/mock-data/projects";
import { quotes } from "@/lib/mock-data/quotes";
import { cn } from "@/lib/utils";

const TOP_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  quotes: "Quotes",
  projects: "Projects",
  clients: "Clients",
  inventory: "Inventory",
  scheduling: "Scheduling",
  financials: "Financials",
  users: "Users & Permissions",
  settings: "Settings",
  new: "New",
};

const PROJECT_TAB_LABELS: Record<string, string> = {
  overview: "Overview",
  tasks: "Tasks",
  schedule: "Schedule",
  materials: "Materials",
  commissioning: "Commissioning",
  zones: "Zone List",
  documents: "Documents",
  financials: "Financials",
  time: "Time & Labor",
};

interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ className }: { className?: string }) {
  const pathname = usePathname();
  const search = useSearchParams();

  const crumbs = useMemo<Crumb[]>(() => {
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 0) return [{ label: "Dashboard" }];

    const out: Crumb[] = [];
    const top = segments[0];
    out.push({
      label: TOP_LABELS[top] ?? top.charAt(0).toUpperCase() + top.slice(1),
      href: `/${top}`,
    });

    if (top === "projects" && segments[1]) {
      const project = projects.find((p) => p.id === segments[1]);
      out.push({
        label: project?.name ?? segments[1],
        href: `/projects/${segments[1]}`,
      });
      const tab = search.get("tab");
      if (tab && PROJECT_TAB_LABELS[tab]) {
        out.push({ label: PROJECT_TAB_LABELS[tab] });
      }
    } else if (top === "quotes" && segments[1]) {
      if (segments[1] === "new") {
        out.push({ label: "New Quote" });
      } else {
        const quote = quotes.find((q) => q.id === segments[1]);
        out.push({ label: quote?.number ?? segments[1] });
      }
    }

    return out;
  }, [pathname, search]);

  if (crumbs.length === 1) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "text-muted-foreground flex items-center gap-1.5 text-xs",
        className
      )}
    >
      {crumbs.map((c, idx) => {
        const isLast = idx === crumbs.length - 1;
        return (
          <span key={`${c.label}-${idx}`} className="inline-flex items-center gap-1.5">
            {idx > 0 && <ChevronRight className="h-3 w-3 opacity-50" />}
            {c.href && !isLast ? (
              <Link
                href={c.href}
                className="hover:text-brand-charcoal underline-offset-2 hover:underline"
              >
                {c.label}
              </Link>
            ) : (
              <span className={cn(isLast && "text-brand-charcoal font-medium")}>
                {c.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
