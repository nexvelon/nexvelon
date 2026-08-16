// AUD-3 — the per-user activity view ("what has this person been doing"). Gated
// more tightly than the central feed: viewing SOMEONE ELSE needs users:view (the
// supervisory gate that already guards the team-management area from which this
// is reached); a user may ALWAYS view their OWN. Rows + summary are still
// permission-scoped to the VIEWER, so a monitor never sees hidden activity.

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import { adaptDbRole } from "@/lib/permissions/resolve";
import {
  listActivityActors,
  activityUserSummary,
} from "@/lib/api/activity-log";
import { ENTITY_TYPE_LABEL, canViewUserActivity } from "@/lib/activity-access";
import { rangeFor } from "@/lib/date-range";
import { format, parseISO } from "date-fns";
import { ActivityFeedView } from "@/app/(app)/activity/ActivityFeedView";
import { loadActivityFeedAction } from "@/app/(app)/activity/actions";
import { parseFeedParams } from "@/app/(app)/activity/page";

export const dynamic = "force-dynamic";

export default async function UserActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await getCurrentProfile();
  if (!me) redirect("/login");

  const { id } = await params;
  const role = adaptDbRole(me.role);
  const isSelf = id === me.id;
  const canMonitor = hasPermission(role, "users", "view");

  if (!canViewUserActivity(role, me.id, id)) {
    return (
      <div className="mx-auto max-w-md py-16">
        <Card className="bg-card border-t-2 border-t-[#C9A24B] p-8 text-center shadow-sm">
          <div className="bg-brand-charcoal/5 text-brand-charcoal/50 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="text-brand-navy font-serif text-2xl">Restricted</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            You can only view your own activity. Viewing a colleague&rsquo;s
            activity needs the Users &amp; Permissions access.
          </p>
        </Card>
      </div>
    );
  }

  const base = parseFeedParams(await searchParams);
  const input = { ...base, actorId: id };
  const win =
    input.from && input.to
      ? { from: input.from, to: input.to }
      : (() => {
          const r = rangeFor(input.range ?? "mtd");
          return { from: r.start.toISOString(), to: r.end.toISOString() };
        })();

  const [res, actors, summary] = await Promise.all([
    loadActivityFeedAction(input),
    listActivityActors(),
    activityUserSummary(role, id, win.from, win.to),
  ]);

  const who = actors.find((a) => a.id === id)?.name ?? (isSelf ? "You" : "User");

  return (
    <div className="space-y-6">
      <Link
        href="/users"
        className="text-muted-foreground hover:text-brand-charcoal inline-flex items-center gap-1.5 text-xs"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Users &amp; Permissions
      </Link>
      <PageHeader
        eyebrow="Activity"
        title={isSelf ? "My activity" : who}
        description="Everything this person has done, in the selected range."
      />

      {/* Summary — real counts only (§2.8). */}
      <Card
        className="p-5 shadow-sm"
        style={{ background: "var(--brand-card)", borderColor: "var(--brand-border)" }}
      >
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <Stat label="Actions in range" value={`${summary.total}`} />
          <Stat
            label="Most recent"
            value={
              summary.mostRecentAt
                ? format(parseISO(summary.mostRecentAt), "MMM d, yyyy 'at' h:mm a")
                : "—"
            }
          />
          <div className="min-w-0">
            <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
              By type{summary.capped ? " (recent 1,000)" : ""}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {summary.byType.length === 0 ? (
                <span className="text-muted-foreground text-sm">—</span>
              ) : (
                summary.byType.slice(0, 8).map((b) => (
                  <span
                    key={b.entityType}
                    className="text-brand-navy border-brand-gold/40 bg-brand-navy/5 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs"
                  >
                    {ENTITY_TYPE_LABEL[b.entityType]}
                    <span className="font-semibold">{b.count}</span>
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      </Card>

      {res.ok ? (
        <ActivityFeedView
          actors={actors}
          input={input}
          initial={res.page}
          lockActor
          meId={me.id}
          canMonitor={canMonitor}
        />
      ) : (
        <p className="text-muted-foreground text-sm">{res.error}</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-[11px] tracking-wide uppercase">{label}</p>
      <p className="text-brand-navy mt-0.5 font-serif text-lg">{value}</p>
    </div>
  );
}
