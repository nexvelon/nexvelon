// AUD-3 — the central Activity module. Any signed-in user may open it; every row
// is permission-scoped server-side (loadActivityFeedAction → listActivityFeed
// with the caller's role), so no one sees a record they couldn't already view.
// Filters live in the URL; the page re-renders page 0 on each change.

import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import { adaptDbRole } from "@/lib/permissions/resolve";
import { listActivityActors } from "@/lib/api/activity-log";
import { ActivityFeedView } from "./ActivityFeedView";
import { loadActivityFeedAction, type ActivityFeedInput } from "./actions";
import { ACTIVITY_ENTITY_TYPES, type ActivityEntityType } from "@/lib/types/database";
import type { RangeKey } from "@/lib/date-range";

export const dynamic = "force-dynamic";

const RANGE_KEYS: RangeKey[] = ["today", "7d", "mtd", "qtd", "ytd", "custom"];
const ACTIONS = ["create", "update", "delete"] as const;

/** Parse URL search params → a validated feed input (also used by the per-user view). */
export function parseFeedParams(
  sp: Record<string, string | string[] | undefined>
): ActivityFeedInput {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const rawTypes = (one(sp.types) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((t): t is ActivityEntityType =>
      (ACTIVITY_ENTITY_TYPES as readonly string[]).includes(t)
    );
  const range = one(sp.range);
  const action = one(sp.action);
  return {
    actorId: one(sp.actor) || undefined,
    entityTypes: rawTypes.length ? rawTypes : undefined,
    action: ACTIONS.includes(action as (typeof ACTIONS)[number])
      ? (action as (typeof ACTIONS)[number])
      : undefined,
    range: RANGE_KEYS.includes(range as RangeKey) ? (range as RangeKey) : undefined,
    from: one(sp.from) || undefined,
    to: one(sp.to) || undefined,
    q: one(sp.q) || undefined,
  };
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await getCurrentProfile();
  if (!me) redirect("/login");

  const input = parseFeedParams(await searchParams);
  const [res, actors] = await Promise.all([
    loadActivityFeedAction(input),
    listActivityActors(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Audit"
        title="Activity"
        description="Everything that has happened across the system — filter by who, what, and when."
      />
      {res.ok ? (
        <ActivityFeedView
          actors={actors}
          input={input}
          initial={res.page}
          meId={me.id}
          canMonitor={hasPermission(adaptDbRole(me.role), "users", "view")}
        />
      ) : (
        <p className="text-muted-foreground text-sm">{res.error}</p>
      )}
    </div>
  );
}
