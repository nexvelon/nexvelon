"use client";

import { format, parseISO } from "date-fns";
import { Edit3, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { DbClientWithCounts, DbSite } from "@/lib/types/database";
import { TIER_BADGE, initials } from "./shared";

export function ClientHeader({
  client,
  sites,
  onEdit,
  onAddSite,
}: {
  client: DbClientWithCounts;
  sites: DbSite[];
  onEdit: () => void;
  onAddSite: () => void;
}) {
  const tier = client.tier;
  const badge = tier ? TIER_BADGE[tier] : null;

  return (
    <Card
      className="p-6 shadow-sm"
      style={{
        background: "var(--brand-card)",
        borderColor: "var(--brand-border)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {badge && (
            <span
              className="flex h-14 w-14 items-center justify-center font-mono text-[16px] font-bold tracking-widest rounded-sm"
              style={{ background: badge.bg, color: badge.text }}
            >
              {initials(client.name)}
            </span>
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {tier && badge && (
                <span
                  className="rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest"
                  style={{ background: badge.bg, color: badge.text }}
                >
                  {tier}
                </span>
              )}
              {client.client_code && (
                <span
                  className="text-[10px] font-mono uppercase tracking-widest"
                  style={{ color: "var(--brand-accent-soft)" }}
                >
                  · ACCT {client.client_code}
                </span>
              )}
              <span
                className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest"
                style={{
                  color:
                    client.status === "Active"
                      ? "var(--brand-status-green)"
                      : "var(--brand-accent-soft)",
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background:
                      client.status === "Active"
                        ? "var(--brand-status-green)"
                        : "var(--brand-accent-soft)",
                  }}
                />
                {client.status.toUpperCase()}
              </span>
              <span
                className="text-[10px] font-mono uppercase tracking-widest"
                style={{ color: "var(--brand-accent-soft)" }}
              >
                · {sites.length} SITE{sites.length === 1 ? "" : "S"}
              </span>
            </div>
            <h2
              className="mt-1.5 font-serif text-3xl tracking-tight"
              style={{ color: "var(--brand-primary)" }}
            >
              {client.name}
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              {client.industry ?? client.type ?? "—"} · Client since{" "}
              {format(parseISO(client.created_at), "MMMM yyyy")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-[11px] font-medium hover:bg-muted/40"
            style={{
              borderColor: "var(--brand-border)",
              color: "var(--brand-text)",
            }}
          >
            <Edit3 className="h-3 w-3" />
            Edit
          </button>
          <button
            type="button"
            onClick={onAddSite}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium text-white"
            style={{ background: "var(--brand-primary)" }}
          >
            <Plus className="h-3 w-3" />
            New site
          </button>
        </div>
      </div>
    </Card>
  );
}

export function ClientStatsRow({ client }: { client: DbClientWithCounts }) {
  const stats: Array<{ label: string; value: string; sub?: string }> = [
    {
      label: "Lifetime Value",
      value: formatCurrency(client.lifetime_value),
    },
    {
      label: "YTD Revenue",
      value: formatCurrency(client.ytd_revenue),
    },
    {
      label: "Open AR",
      value: "—",
      sub: "Wire invoicing module",
    },
    {
      label: "Active Sites",
      value: `${client.site_count}`,
    },
    {
      label: "NPS",
      value: client.nps_score != null ? `${client.nps_score}` : "—",
      sub: client.last_nps_date
        ? `Last survey ${format(parseISO(client.last_nps_date), "MMM d")}`
        : undefined,
    },
  ];

  return (
    <Card
      className="grid grid-cols-2 gap-4 p-5 shadow-sm md:grid-cols-5"
      style={{
        background: "var(--brand-card)",
        borderColor: "var(--brand-border)",
      }}
    >
      {stats.map((s) => (
        <div key={s.label}>
          <p className="nx-eyebrow-soft mb-1">{s.label}</p>
          <p
            className="font-serif text-xl tabular-nums"
            style={{ color: "var(--brand-primary)" }}
          >
            {s.value}
          </p>
          {s.sub && (
            <p className="text-muted-foreground mt-0.5 text-[10px]">{s.sub}</p>
          )}
        </div>
      ))}
    </Card>
  );
}
