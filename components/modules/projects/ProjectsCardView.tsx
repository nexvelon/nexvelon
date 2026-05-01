"use client";

import { format, parseISO } from "date-fns";
import {
  Camera,
  KeyRound,
  PhoneCall,
  ShieldAlert,
  Siren,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { ProjectStatusBadge } from "./ProjectStatusBadge";
import { ProgressRing } from "./ProgressRing";
import { formatCurrency } from "@/lib/format";
import type { Client, Project, SystemType, User } from "@/lib/types";

const SYSTEM_ICONS: Record<SystemType, LucideIcon> = {
  "Access Control": KeyRound,
  CCTV: Camera,
  Intrusion: Siren,
  Intercom: PhoneCall,
  "Fire Monitoring": ShieldAlert,
};

interface Props {
  projects: Project[];
  clients: Client[];
  users: User[];
  onView: (p: Project) => void;
}

export function ProjectsCardView({ projects, clients, users, onView }: Props) {
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const userById = new Map(users.map((u) => [u.id, u]));

  if (projects.length === 0) {
    return (
      <div className="bg-card text-muted-foreground rounded-lg border border-[var(--border)] py-16 text-center text-sm shadow-sm">
        No projects match the current filters.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => {
        const pm = userById.get(p.managerId);
        return (
          <Card
            key={p.id}
            onClick={() => onView(p)}
            className="cursor-pointer p-5 transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground font-mono text-[10px] tracking-wider uppercase">
                  {p.code}
                </p>
                <h3 className="text-brand-navy font-serif text-base leading-snug">
                  {p.name}
                </h3>
                <p className="text-muted-foreground mt-0.5 truncate text-xs">
                  {clientById.get(p.clientId)?.name ?? "—"}
                </p>
              </div>
              <ProgressRing value={p.progress} size={64} stroke={7} showLabel={false} />
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.systemTypes.map((t) => {
                const Icon = SYSTEM_ICONS[t];
                return (
                  <span
                    key={t}
                    className="bg-brand-navy/8 text-brand-navy inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]"
                  >
                    <Icon className="h-3 w-3" />
                    {t}
                  </span>
                );
              })}
            </div>

            <div className="mt-4 flex items-end justify-between">
              <div>
                <p className="text-muted-foreground text-[10px] uppercase tracking-wider">
                  Contract value
                </p>
                <p className="text-brand-navy font-serif text-lg tabular-nums">
                  {formatCurrency(p.budget)}
                </p>
              </div>
              <div className="text-right">
                <ProjectStatusBadge status={p.status} />
                <p className="text-muted-foreground mt-1 text-[10px]">
                  Target {format(parseISO(p.targetDate), "MMM d, yyyy")}
                </p>
                {pm && (
                  <p className="text-muted-foreground text-[10px]">PM · {pm.name}</p>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
