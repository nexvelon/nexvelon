"use client";

import { useMemo } from "react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import {
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  Mail,
  Phone,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { products } from "@/lib/mock-data/products";
import { clients } from "@/lib/mock-data/clients";
import { sites as ALL_SITES } from "@/lib/mock-data/sites";
import { users } from "@/lib/mock-data/users";
import {
  buildMaterials,
  buildTasks,
  buildTimeEntries,
} from "@/lib/project-data";
import { TODAY } from "@/lib/dashboard-data";
import { formatNumber } from "@/lib/format";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function OverviewTab({ project }: Props) {
  const tasks = useMemo(() => buildTasks(project), [project]);
  const materials = useMemo(() => buildMaterials(project), [project]);
  const time = useMemo(() => buildTimeEntries(project), [project]);

  const productById = new Map(products.map((p) => [p.id, p]));
  const client = clients.find((c) => c.id === project.clientId);
  const site = project.siteId ? ALL_SITES.find((s) => s.id === project.siteId) : undefined;
  const pm = users.find((u) => u.id === project.managerId);
  const tech = project.leadTechId
    ? users.find((u) => u.id === project.leadTechId)
    : undefined;
  const sales = project.salesRepId
    ? users.find((u) => u.id === project.salesRepId)
    : undefined;

  const milestones = tasks.filter((t) => t.isMilestone);
  const tasksOpen = tasks.filter((t) => t.status !== "Done").length;
  const totalAlloc = materials.reduce((s, m) => s + m.qtyRequired, 0);
  const totalUsed = materials.reduce((s, m) => s + m.qtyUsed, 0);
  const allocPct = totalAlloc === 0 ? 0 : Math.round((totalUsed / totalAlloc) * 100);
  const hoursLogged = time.reduce((s, t) => s + t.hours, 0);
  const hoursBudget = Math.max(120, hoursLogged * 1.6);
  const daysRemaining = differenceInCalendarDays(parseISO(project.targetDate), TODAY);

  const stakeholders = [
    client?.contactName && {
      role: "Client contact",
      name: client.contactName,
      email: client.email,
      phone: client.phone,
    },
    site && {
      role: "Site contact",
      name: client?.contactName ?? "Site supervisor",
      email: client?.email ?? "",
      phone: client?.phone ?? "",
    },
    pm && {
      role: "Project Manager",
      name: pm.name,
      email: pm.email,
      phone: pm.phone,
    },
    tech && {
      role: "Lead Technician",
      name: tech.name,
      email: tech.email,
      phone: tech.phone,
    },
    sales && {
      role: "Sales Rep",
      name: sales.name,
      email: sales.email,
      phone: sales.phone,
    },
  ].filter(Boolean) as Array<{
    role: string;
    name: string;
    email: string;
    phone: string;
  }>;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-serif text-lg">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-brand-charcoal text-sm leading-relaxed">
              {project.description}
            </p>
            {project.scope && (
              <>
                <h3 className="text-brand-navy mt-4 mb-1 font-serif text-sm">
                  Scope of work
                </h3>
                <p className="text-brand-charcoal/85 text-xs leading-relaxed whitespace-pre-line">
                  {project.scope}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-serif text-lg">System Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {materials.slice(0, 12).map((m) => {
                const prod = productById.get(m.productId);
                if (!prod) return null;
                return (
                  <span
                    key={m.id}
                    className="bg-brand-navy/8 text-brand-navy inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px]"
                  >
                    <span className="font-mono">{prod.sku}</span>
                    <span className="text-muted-foreground">×{m.qtyRequired}</span>
                  </span>
                );
              })}
            </div>
            <p className="text-muted-foreground mt-3 text-[11px]">
              Pulled from Materials tab — see allocation status there.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-serif text-lg">Key Milestones</CardTitle>
          </CardHeader>
          <CardContent>
            {milestones.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                No milestones flagged on this project yet.
              </p>
            ) : (
              <ol className="space-y-2.5">
                {milestones.map((m) => {
                  const done = m.status === "Done";
                  return (
                    <li key={m.id} className="flex items-center gap-3 text-sm">
                      {done ? (
                        <CheckCircle2 className="text-emerald-600 h-4 w-4 shrink-0" />
                      ) : (
                        <Circle className="text-muted-foreground h-4 w-4 shrink-0" />
                      )}
                      <span
                        className={
                          done
                            ? "text-muted-foreground line-through"
                            : "text-brand-charcoal"
                        }
                      >
                        {m.name}
                      </span>
                      <span className="text-muted-foreground ml-auto text-[11px] tabular-nums">
                        {format(parseISO(m.dueDate), "MMM d, yyyy")}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-serif text-lg">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-3 pl-5">
              <span className="bg-border absolute top-1 bottom-1 left-1.5 w-px" />
              {[
                { ts: TODAY, text: `Status set to ${project.status} by ${pm?.name ?? "PM"}` },
                {
                  ts: time[0]?.date ? parseISO(time[0].date) : TODAY,
                  text: time[0]
                    ? `${formatNumber(time[0].hours)}h logged — ${time[0].task}`
                    : "Time entry sync up to date",
                },
                {
                  ts: parseISO(project.startDate),
                  text: `Project kickoff with ${client?.name ?? "client"}`,
                },
                {
                  ts: parseISO(project.startDate),
                  text: `Quote ${project.quoteId ?? "draft"} converted to project ${project.code}`,
                },
              ].map((e, idx) => (
                <li key={idx} className="relative">
                  <span className="bg-brand-gold ring-background absolute top-1.5 -left-[14px] h-2.5 w-2.5 rounded-full ring-4" />
                  <p className="text-brand-charcoal text-sm leading-snug">
                    {e.text}
                  </p>
                  <p className="text-muted-foreground text-[11px]">
                    {format(e.ts, "MMM d, yyyy")}
                  </p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6 lg:col-span-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-serif text-lg">Stakeholders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stakeholders.map((s) => (
              <div
                key={`${s.role}-${s.name}`}
                className="flex items-start gap-3 border-b border-[var(--border)] pb-3 last:border-b-0 last:pb-0"
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-brand-navy text-[10px] font-semibold text-white">
                    {initials(s.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 text-xs">
                  <p className="text-muted-foreground text-[10px] uppercase tracking-wider">
                    {s.role}
                  </p>
                  <p className="text-brand-charcoal truncate font-medium">
                    {s.name}
                  </p>
                  {s.email && (
                    <p className="text-muted-foreground inline-flex items-center gap-1 truncate">
                      <Mail className="h-3 w-3" />
                      {s.email}
                    </p>
                  )}
                  {s.phone && (
                    <p className="text-muted-foreground inline-flex items-center gap-1 truncate">
                      <Phone className="h-3 w-3" />
                      {s.phone}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-serif text-lg">Quick Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <Stat
              icon={<Clock className="text-brand-gold h-3.5 w-3.5" />}
              label="Days remaining"
              value={
                daysRemaining > 0
                  ? `${daysRemaining}`
                  : daysRemaining === 0
                    ? "Due today"
                    : `${Math.abs(daysRemaining)} overdue`
              }
              tone={daysRemaining < 14 ? "warning" : "default"}
            />
            <Stat
              label="Tasks open / total"
              value={`${tasksOpen} / ${tasks.length}`}
            />
            <Stat
              label="Materials installed"
              value={`${allocPct}%`}
            />
            <Stat
              label="Hours logged / budget"
              value={`${formatNumber(hoursLogged)}h / ${formatNumber(Math.round(hoursBudget))}h`}
            />
            {project.quoteId && (
              <Stat
                icon={<FileText className="text-brand-gold h-3.5 w-3.5" />}
                label="Origin quote"
                value={project.quoteId.toUpperCase()}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "warning";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span
        className={
          tone === "warning"
            ? "font-semibold text-red-600 tabular-nums"
            : "text-brand-charcoal font-semibold tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  );
}
