"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CalendarRange,
  ListChecks,
  PieChart as PieIcon,
  UserMinus,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { AnimatedNumber } from "@/components/modules/dashboard/AnimatedNumber";
import { UnassignedQueue } from "@/components/modules/scheduling/UnassignedQueue";
import { CalendarView } from "@/components/modules/scheduling/CalendarView";
import { TechDrawer } from "@/components/modules/scheduling/TechDrawer";
import {
  buildJobs,
  buildUnassigned,
  computeSchedulingStats,
  type ScheduleJob,
} from "@/lib/scheduling-data";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import { currentUser } from "@/lib/mock-data/users";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";

export default function SchedulingPage() {
  const { role } = useRole();
  const canViewAll = hasPermission(role, "scheduling", "viewAll");
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [jobs, setJobs] = useState<ScheduleJob[]>(() => buildJobs());
  const [unassigned, setUnassigned] = useState(() => buildUnassigned());
  const [search, setSearch] = useState("");
  const [drawerTech, setDrawerTech] = useState<User | null>(null);

  const stats = useMemo(() => computeSchedulingStats(jobs, unassigned), [jobs, unassigned]);
  const filteredQueue = unassigned.filter((j) =>
    !search ? true : j.systemSummary.toLowerCase().includes(search.toLowerCase())
  );

  // When an unassigned job is dropped onto the calendar, the CalendarView
  // creates a corresponding ScheduleJob. We mirror that by removing it from
  // the queue, looking up the matching id.
  const handleJobsChange = (next: ScheduleJob[]) => {
    setJobs(next);
    const newIds = new Set(next.map((j) => j.id.replace("job-", "")));
    setUnassigned((q) => q.filter((j) => !newIds.has(j.id)));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${jobs.length} jobs scheduled · ${unassigned.length} unassigned · ${stats.utilizationPct}% utilization`}
        title="Dispatch Board"
        description="Technician assignments, service calls, and installation crews."
        actions={
          <>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3.5 py-2 text-[12px] font-medium tracking-wide hover:bg-muted/40"
              style={{ borderColor: "var(--brand-border)", color: "var(--brand-text)" }}
            >
              Route sheets
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[12px] font-medium tracking-wide text-white"
              style={{ background: "var(--brand-primary)" }}
            >
              + Schedule job
            </button>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Jobs Today" value={stats.jobsToday} format={formatNumber} icon={CalendarRange} />
        <Stat
          label="Unassigned"
          value={stats.unassigned}
          format={formatNumber}
          icon={ListChecks}
          accent={stats.unassigned > 5 ? "warning" : "default"}
        />
        <Stat label="Technicians Out" value={stats.techsOut} format={formatNumber} icon={UserMinus} />
        <Stat
          label="Utilization (week)"
          value={stats.utilizationPct}
          format={(n) => `${Math.round(n)}%`}
          icon={PieIcon}
        />
      </section>

      {!canViewAll && (
        <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm shadow-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
          <div>
            <p className="font-medium text-amber-900">
              Restricted view — own schedule only
            </p>
            <p className="text-xs leading-relaxed text-amber-900/80">
              Your role can see only its own swimlane. Switch to Admin / PM /
              Accountant in the role-switcher to see everyone.{" "}
              {currentUser.name} is the demo user — you&apos;ll see Marcus&apos;s
              lane when in Technician role.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">
          {jobs.length} jobs scheduled · {unassigned.length} unassigned in queue
        </p>
        <div className="bg-muted inline-flex rounded-md p-0.5 text-xs">
          {(["day", "week", "month"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "rounded px-3 py-1 transition-colors",
                view === v
                  ? "bg-card text-brand-navy shadow-sm"
                  : "text-muted-foreground hover:text-brand-charcoal"
              )}
            >
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <UnassignedQueue
          jobs={filteredQueue}
          search={search}
          onSearch={setSearch}
        />
        <div className="overflow-auto">
          <CalendarView
            jobs={jobs}
            view={view}
            onJobsChange={handleJobsChange}
            onJobClick={(j) =>
              toast(`${j.type}: ${j.systemSummary}`, {
                description: `Demo: would open the job detail sheet.`,
              })
            }
            onTechClick={setDrawerTech}
          />
        </div>
      </div>

      <TechDrawer
        tech={drawerTech}
        jobs={jobs}
        onClose={() => setDrawerTech(null)}
      />
    </div>
  );
}

interface StatProps {
  label: string;
  value: number;
  format: (n: number) => string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "default" | "warning";
}

function Stat({ label, value, format, icon: Icon, accent }: StatProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <Card
        className={cn(
          "border-t-2 flex h-full flex-col gap-1.5 p-4 shadow-sm transition-shadow hover:shadow-md",
          accent === "warning" ? "border-t-red-500" : "border-t-[#C9A24B]"
        )}
      >
        <div className="flex items-center justify-between">
          <span className="font-serif text-xs tracking-wide text-brand-charcoal/70">{label}</span>
          <Icon className={cn("h-4 w-4", accent === "warning" ? "text-red-500" : "text-brand-gold")} />
        </div>
        <div className="text-brand-navy text-2xl font-semibold tracking-tight tabular-nums">
          <AnimatedNumber value={value} format={format} />
        </div>
      </Card>
    </motion.div>
  );
}
