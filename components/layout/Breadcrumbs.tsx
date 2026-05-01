"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { projects } from "@/lib/mock-data/projects";
import { quotes } from "@/lib/mock-data/quotes";
import { cn } from "@/lib/utils";

const TOP_LABELS: Record<string, string> = {
  dashboard: "Executive Dashboard",
  quotes: "Quotes",
  projects: "Projects",
  clients: "Clients & Sites",
  inventory: "Inventory",
  scheduling: "Scheduling",
  financials: "Financial Operations",
  users: "Users & Permissions",
  settings: "Settings",
  new: "New Quote",
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

function buildCrumbs(pathname: string, tab: string | null): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return [{ label: "OPERATIONS" }, { label: "DASHBOARD" }];

  const out: Crumb[] = [{ label: "OPERATIONS" }];
  const top = segments[0];
  out.push({
    label: (TOP_LABELS[top] ?? top).toUpperCase(),
    href: `/${top}`,
  });

  if (top === "projects" && segments[1]) {
    if (segments[1] === "new") {
      out.push({ label: "NEW PROJECT" });
    } else {
      const project = projects.find((p) => p.id === segments[1]);
      out.push({
        label: (project?.name ?? segments[1]).toUpperCase(),
      });
      if (tab && PROJECT_TAB_LABELS[tab]) {
        out.push({ label: PROJECT_TAB_LABELS[tab].toUpperCase() });
      }
    }
  } else if (top === "quotes" && segments[1]) {
    if (segments[1] === "new") {
      out.push({ label: "NEW QUOTE" });
    } else {
      const quote = quotes.find((q) => q.id === segments[1]);
      out.push({ label: (quote?.number ?? segments[1]).toUpperCase() });
    }
  }

  return out;
}

/** Gold uppercase tracked breadcrumbs in the top bar. */
export function GoldBreadcrumbs({ className }: { className?: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const tab = search.get("tab");
  const crumbs = useMemo(() => buildCrumbs(pathname, tab), [pathname, tab]);

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex items-center gap-2 text-[10px] tracking-[0.22em] uppercase font-semibold", className)}
      style={{ color: "var(--brand-accent-soft)" }}
    >
      {crumbs.map((c, idx) => {
        const isLast = idx === crumbs.length - 1;
        return (
          <span key={`${c.label}-${idx}`} className="inline-flex items-center gap-2">
            {idx > 0 && (
              <span className="opacity-60" aria-hidden>
                ›
              </span>
            )}
            {c.href && !isLast ? (
              <Link
                href={c.href}
                className="hover:opacity-100 underline-offset-2 hover:underline"
                style={{ opacity: 0.7 }}
              >
                {c.label}
              </Link>
            ) : (
              <span style={{ color: isLast ? "var(--brand-accent)" : undefined }}>
                {c.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/** Backwards-compat: previous default breadcrumb used elsewhere. */
export const Breadcrumbs = GoldBreadcrumbs;
