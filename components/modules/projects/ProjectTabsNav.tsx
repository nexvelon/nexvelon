"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  Boxes,
  CalendarRange,
  ClipboardCheck,
  FileText,
  KanbanSquare,
  Lock,
  Receipt,
  Timer,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const PROJECT_TABS = [
  "overview",
  "tasks",
  "schedule",
  "materials",
  "commissioning",
  "zones",
  "documents",
  "financials",
  "time",
] as const;
export type ProjectTab = (typeof PROJECT_TABS)[number];

const TAB_LABEL: Record<ProjectTab, string> = {
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

const TAB_ICON: Record<ProjectTab, LucideIcon> = {
  overview: BookOpen,
  tasks: KanbanSquare,
  schedule: CalendarRange,
  materials: Boxes,
  commissioning: ClipboardCheck,
  zones: Wrench,
  documents: FileText,
  financials: Receipt,
  time: Timer,
};

export function isProjectTab(s: string | null): s is ProjectTab {
  return s !== null && (PROJECT_TABS as readonly string[]).includes(s);
}

interface Props {
  projectId: string;
  current: ProjectTab;
  highlightCommissioning?: boolean;
  financialsLocked?: boolean;
}

export function ProjectTabsNav({
  projectId,
  current,
  highlightCommissioning,
  financialsLocked,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <nav className="bg-card sticky top-[225px] z-[5] -mx-8 border-b border-[var(--border)] px-8">
      <ul className="flex flex-wrap items-end gap-1 overflow-x-auto">
        {PROJECT_TABS.map((tab) => {
          const Icon = TAB_ICON[tab];
          const isActive = current === tab;
          const isLocked = tab === "financials" && financialsLocked;
          const isCommissioningRing =
            tab === "commissioning" && highlightCommissioning && !isActive;
          return (
            <li key={tab}>
              <button
                type="button"
                onClick={() => {
                  const next = new URLSearchParams(params.toString());
                  next.set("tab", tab);
                  router.push(`/projects/${projectId}?${next.toString()}`, {
                    scroll: false,
                  });
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors",
                  isActive
                    ? "border-brand-gold text-brand-navy"
                    : "border-transparent text-muted-foreground hover:text-brand-charcoal",
                  isCommissioningRing &&
                    "ring-brand-gold/60 ring-offset-card rounded-t-md ring-1 ring-offset-2"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {TAB_LABEL[tab]}
                {isLocked && <Lock className="h-3 w-3 opacity-50" />}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
