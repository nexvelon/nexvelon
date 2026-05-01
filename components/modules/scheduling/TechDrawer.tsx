"use client";

import { isSameDay, parseISO } from "date-fns";
import { Mail, Phone, ShieldCheck, Truck } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TODAY } from "@/lib/dashboard-data";
import {
  jobLabelTime,
  techExtras,
  type ScheduleJob,
} from "@/lib/scheduling-data";
import type { User } from "@/lib/types";

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

interface Props {
  tech: User | null;
  jobs: ScheduleJob[];
  onClose: () => void;
}

export function TechDrawer({ tech, jobs, onClose }: Props) {
  const open = tech !== null;
  const extras = tech ? techExtras(tech.id) : null;
  const todayJobs = tech
    ? jobs.filter(
        (j) => j.techId === tech.id && isSameDay(parseISO(j.start), TODAY)
      )
    : [];
  const utilization = tech
    ? Math.round(
        (jobs
          .filter((j) => j.techId === tech.id)
          .reduce((s, j) => s + j.durationMin, 0) /
          (5 * 8 * 60)) *
          100
      )
    : 0;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[400px] sm:max-w-md">
        {tech && extras && (
          <>
            <SheetHeader>
              <div className="flex items-start gap-3">
                <Avatar className="ring-brand-gold/40 h-14 w-14 ring-2">
                  <AvatarFallback
                    style={{ backgroundColor: tech.avatarColor }}
                    className="text-sm font-semibold text-white"
                  >
                    {initials(tech.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <SheetTitle className="font-serif text-xl">
                    {tech.name}
                  </SheetTitle>
                  <SheetDescription>
                    <span className="bg-brand-navy/10 text-brand-navy mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
                      {tech.role}
                    </span>
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="space-y-4 px-4 pb-4">
              <section className="space-y-2 text-sm">
                <p className="text-muted-foreground inline-flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5" />
                  {tech.email}
                </p>
                <p className="text-muted-foreground inline-flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5" />
                  {tech.phone}
                </p>
              </section>

              <section>
                <h3 className="text-muted-foreground mb-1.5 text-[10px] font-semibold uppercase tracking-wider">
                  Certifications
                </h3>
                <ul className="space-y-1 text-xs">
                  {extras.certifications.map((c) => (
                    <li
                      key={c}
                      className="text-brand-charcoal inline-flex items-center gap-1.5"
                    >
                      <ShieldCheck className="text-brand-gold h-3 w-3" />
                      {c}
                    </li>
                  ))}
                  <li className="text-brand-charcoal inline-flex items-center gap-1.5">
                    <ShieldCheck className="text-brand-gold h-3 w-3" />
                    {extras.licenseEsa}
                  </li>
                  {extras.workingAtHeights && (
                    <li className="text-brand-charcoal inline-flex items-center gap-1.5">
                      <ShieldCheck className="text-brand-gold h-3 w-3" />
                      Working at Heights (Ontario)
                    </li>
                  )}
                </ul>
              </section>

              <section>
                <h3 className="text-muted-foreground mb-1.5 text-[10px] font-semibold uppercase tracking-wider">
                  Vehicle
                </h3>
                <p className="text-brand-charcoal inline-flex items-center gap-1.5 text-xs">
                  <Truck className="text-brand-gold h-3 w-3" />
                  {extras.vehicle}
                </p>
              </section>

              <section>
                <h3 className="text-muted-foreground mb-1.5 text-[10px] font-semibold uppercase tracking-wider">
                  Today&apos;s schedule
                </h3>
                {todayJobs.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    No jobs scheduled today.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {todayJobs.map((j) => (
                      <li
                        key={j.id}
                        className="bg-muted/50 rounded-md px-2 py-1.5 text-xs"
                      >
                        <span className="text-brand-navy font-mono text-[10px]">
                          {jobLabelTime(j)}
                        </span>
                        <span className="text-brand-charcoal ml-2">
                          {j.systemSummary}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="text-muted-foreground mb-1.5 text-[10px] font-semibold uppercase tracking-wider">
                  This week — utilization
                </h3>
                <div className="flex items-center gap-3">
                  <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
                    <div
                      className="bg-brand-gold h-full"
                      style={{ width: `${Math.min(100, utilization)}%` }}
                    />
                  </div>
                  <span className="text-brand-charcoal text-xs font-semibold tabular-nums">
                    {utilization}%
                  </span>
                </div>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
