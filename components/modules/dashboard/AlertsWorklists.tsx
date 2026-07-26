"use client";

// DASH-2 — the real alerts & worklists roll-up. Fed by getDashboardAlertsAction,
// which returns each block gated by its resource (a null block = restricted →
// hidden). A present block with zero real items shows a calm "All clear" — an
// empty worklist is meaningful, not hidden.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  CalendarClock,
  ClipboardCheck,
  Flag,
  ShieldAlert,
  Truck,
  Wrench,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { getDashboardAlertsAction } from "@/app/(app)/dashboard/actions";
import type { DashboardAlerts } from "@/lib/api/dashboard";

export function AlertsWorklists() {
  const [data, setData] = useState<DashboardAlerts | null>(null);

  useEffect(() => {
    getDashboardAlertsAction().then((r) => r.ok && setData(r.data));
  }, []);

  if (!data) {
    return (
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-card h-32 animate-pulse rounded-lg border border-[var(--border)]" />
        ))}
      </section>
    );
  }

  const c = data.compliance_at_risk;
  const bw = data.bond_warranty_alerts;
  const t = data.overdue_tasks;
  const d = data.deficiencies;
  const m = data.upcoming_milestones;
  const dt = data.dispatch_today;
  const tc = data.tech_cert_alerts;

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {c && (
        <AlertCard icon={ShieldAlert} title="Compliance at risk" href="/subcontractors" tone={c.total_at_risk > 0 ? "danger" : "ok"}>
          {c.total_at_risk === 0 ? (
            <AllClear label="All subcontractors compliant" />
          ) : (
            <BigCount n={c.total_at_risk} unit="subcontractor(s)" sub={`${c.expired} expired · ${c.missing_required} missing · ${c.expiring_soon} expiring`} />
          )}
        </AlertCard>
      )}

      {bw && (
        <AlertCard icon={Flag} title="Bonds & warranties" href="/projects" tone={bw.expired > 0 ? "danger" : bw.expiring_soon > 0 ? "warn" : "ok"}>
          {bw.bonds + bw.warranties === 0 ? (
            <AllClear label="Nothing expiring" />
          ) : (
            <BigCount n={bw.bonds + bw.warranties} unit="expiring" sub={`${bw.expired} expired · ${bw.expiring_soon} expiring soon`} />
          )}
        </AlertCard>
      )}

      {tc && (
        <AlertCard icon={BadgeCheck} title="Tech certifications" href="/settings" tone={tc.expired > 0 ? "danger" : tc.expiring_soon > 0 ? "warn" : "ok"}>
          {tc.total_at_risk === 0 ? (
            <AllClear label="All certifications current" />
          ) : (
            <BigCount n={tc.total_at_risk} unit="cert(s)" sub={`${tc.expired} expired · ${tc.expiring_soon} expiring soon`} danger={tc.expired > 0} />
          )}
        </AlertCard>
      )}

      {t && (
        <AlertCard icon={ClipboardCheck} title="Overdue tasks" href="/projects" tone={t.count > 0 ? "warn" : "ok"}>
          {t.count === 0 ? (
            <AllClear label="No overdue tasks" />
          ) : (
            <>
              <BigCount n={t.count} unit="overdue" />
              <ul className="mt-1.5 space-y-0.5">
                {t.items.slice(0, 3).map((it) => (
                  <li key={it.task_id} className="text-muted-foreground truncate text-[11px]">
                    {it.title} <span className="text-red-600">· {it.days_overdue}d</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </AlertCard>
      )}

      {d && (
        <AlertCard icon={Wrench} title="Open deficiencies" href="/projects" tone={d.safety_open > 0 ? "danger" : d.open > 0 ? "warn" : "ok"}>
          {d.open === 0 ? (
            <AllClear label="No open deficiencies" />
          ) : (
            <BigCount
              n={d.open}
              unit="open"
              sub={d.safety_open > 0 ? `${d.safety_open} safety · ${d.projects_affected} project(s)` : `${d.projects_affected} project(s)`}
              danger={d.safety_open > 0}
            />
          )}
        </AlertCard>
      )}

      {m && (
        <AlertCard icon={CalendarClock} title="Upcoming milestones" href="/projects" tone="default">
          {m.items.length === 0 ? (
            <AllClear label="None in the next 14 days" />
          ) : (
            <ul className="space-y-0.5">
              {m.items.slice(0, 4).map((it) => (
                <li key={it.milestone_id} className="flex justify-between gap-2 text-[11px]">
                  <span className="truncate" style={{ color: "var(--brand-primary)" }}>{it.title}</span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">{it.days_until}d</span>
                </li>
              ))}
            </ul>
          )}
        </AlertCard>
      )}

      {dt && (
        <AlertCard icon={Truck} title="Dispatch today" href="/scheduling" tone={dt.unscheduled > 0 ? "warn" : "default"}>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            <Stat n={dt.booked_today} label="booked" />
            <Stat n={dt.unscheduled} label="unscheduled" tone={dt.unscheduled > 0 ? "warn" : undefined} />
            <Stat n={dt.techs_out} label="techs out" />
            <span className="text-muted-foreground">
              <span className="text-brand-charcoal font-semibold tabular-nums">{dt.utilization_pct == null ? "—" : `${dt.utilization_pct}%`}</span> util
            </span>
          </div>
        </AlertCard>
      )}
    </section>
  );
}

function AlertCard({
  icon: Icon,
  title,
  href,
  tone,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  href: string;
  tone: "ok" | "warn" | "danger" | "default";
  children: React.ReactNode;
}) {
  const border =
    tone === "danger" ? "border-t-red-500" : tone === "warn" ? "border-t-amber-400" : tone === "ok" ? "border-t-emerald-500" : "border-t-[#C9A24B]";
  return (
    <Link href={href}>
      <Card className={`bg-card border-t-2 ${border} h-full p-4 shadow-sm transition-shadow hover:shadow-md`}>
        <div className="mb-2 flex items-center gap-2">
          <Icon className="text-brand-navy h-4 w-4" />
          <h4 className="text-brand-navy text-xs font-semibold uppercase tracking-wide">{title}</h4>
        </div>
        {children}
      </Card>
    </Link>
  );
}

function BigCount({ n, unit, sub, danger }: { n: number; unit: string; sub?: string; danger?: boolean }) {
  return (
    <div>
      <p className="tabular-nums">
        <span className={`text-2xl font-semibold ${danger ? "text-red-600" : "text-brand-navy"}`}>{n}</span>{" "}
        <span className="text-muted-foreground text-xs">{unit}</span>
      </p>
      {sub && <p className="text-muted-foreground mt-0.5 text-[11px]">{sub}</p>}
    </div>
  );
}

function AllClear({ label }: { label: string }) {
  return <p className="text-[var(--brand-status-green)] text-xs font-medium">✓ {label}</p>;
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: "warn" }) {
  return (
    <span className="text-muted-foreground">
      <span className={`font-semibold tabular-nums ${tone === "warn" ? "text-amber-600" : "text-brand-charcoal"}`}>{n}</span> {label}
    </span>
  );
}
