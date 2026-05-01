"use client";

import Link from "next/link";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft,
  Archive,
  Copy,
  FileSignature,
  MoreVertical,
  Pencil,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectStatusBadge } from "./ProjectStatusBadge";
import { ProgressRing } from "./ProgressRing";
import { Can } from "@/lib/role-context";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { Client, Project, Site, User } from "@/lib/types";

interface Props {
  project: Project;
  client?: Client;
  site?: Site;
  manager?: User;
}

export function ProjectDetailHeader({ project, client, site, manager }: Props) {
  const margin =
    project.budget > 0 ? (project.budget - project.spent) / project.budget : 0;

  return (
    <Card className="bg-card sticky top-16 z-10 border-t-2 border-t-[#C9A24B] p-6 shadow-sm">
      <div className="mb-3">
        <Link
          href="/projects"
          className="text-muted-foreground hover:text-brand-charcoal inline-flex items-center gap-1 text-xs"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Projects
        </Link>
      </div>

      <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 space-y-2">
          <h1 className="text-brand-navy font-serif text-2xl leading-tight">
            {project.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground font-mono tracking-wider">
              {project.code}
            </span>
            {project.quoteId && (
              <Link
                href={`/quotes/${project.quoteId}`}
                className="text-brand-gold hover:underline"
              >
                Originated from quote
              </Link>
            )}
          </div>

          <dl className="text-brand-charcoal/80 mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
            <Meta label="Client" value={client?.name ?? "—"} />
            <Meta label="Site" value={site?.name ?? "—"} />
            <Meta label="PM" value={manager?.name ?? "—"} />
            <Meta
              label="Schedule"
              value={`${format(parseISO(project.startDate), "MMM d")} – ${format(parseISO(project.targetDate), "MMM d, yyyy")}`}
            />
          </dl>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {project.systemTypes.map((t) => (
              <span
                key={t}
                className="bg-brand-navy/8 text-brand-navy rounded-full px-2 py-0.5 text-[10px]"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        <div className="flex justify-center lg:col-span-2">
          <ProgressRing value={project.progress} size={100} stroke={10} />
        </div>

        <div className="lg:col-span-3 flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <ProjectStatusBadge status={project.status} size="md" />
            <DropdownMenu>
              <DropdownMenuTrigger className="text-muted-foreground hover:bg-muted hover:text-brand-charcoal inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors">
                <MoreVertical className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem>
                  <Pencil className="mr-2 h-4 w-4" /> Edit project
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Copy className="mr-2 h-4 w-4" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <FileSignature className="mr-2 h-4 w-4" /> Generate Closeout Report
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600">
                  <Archive className="mr-2 h-4 w-4" /> Archive
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="text-right">
            <p className="text-muted-foreground text-[10px] uppercase tracking-wider">
              Contract value
            </p>
            <p className="text-brand-navy font-serif text-2xl tabular-nums leading-tight">
              {formatCurrency(project.budget)}
            </p>
            {project.changeOrders ? (
              <p className="text-muted-foreground text-[11px]">
                + {formatCurrency(project.changeOrders)} change orders
              </p>
            ) : null}
          </div>

          <Can resource="quotes" action="viewMargin">
            <div className="text-right">
              <p className="text-muted-foreground text-[10px] uppercase tracking-wider">
                Gross margin
              </p>
              <p className="text-brand-gold font-serif text-base tabular-nums">
                {formatPercent(margin)}
              </p>
            </div>
          </Can>
        </div>
      </div>
    </Card>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-[10px] uppercase tracking-wider">
        {label}
      </dt>
      <dd className="text-brand-charcoal truncate text-xs font-medium">{value}</dd>
    </div>
  );
}
