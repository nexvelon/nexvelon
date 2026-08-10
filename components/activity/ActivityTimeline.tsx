"use client";

// AUD-2 — the ONE reusable Activity surface any entity detail page mounts. Give
// it an entity type + id; it fetches its own rows AND its children's rolled-up
// rows (via the gated, paginated loadEntityActivityAction), renders them with the
// shared ActivityLog, and lazy-loads more. Works on both server pages and client
// pages (it fetches everything client-side).

import { useEffect, useState, useTransition } from "react";
import { ActivityLog } from "./ActivityLog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { loadEntityActivityAction } from "@/app/(app)/activity-actions";
import type { ActivityEntityType, DbActivityLogWithActor } from "@/lib/types/database";

export function ActivityTimeline({
  entityType,
  entityId,
}: {
  entityType: ActivityEntityType;
  entityId: string;
}) {
  const [entries, setEntries] = useState<DbActivityLogWithActor[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const loadPage = (offset: number) =>
    start(async () => {
      const res = await loadEntityActivityAction(entityType, entityId, offset);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setError(null);
      setEntries((prev) =>
        offset === 0 ? res.page.entries : [...(prev ?? []), ...res.page.entries]
      );
      setHasMore(res.page.hasMore);
    });

  useEffect(() => {
    setEntries(null);
    loadPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  if (error) {
    return <p className="text-muted-foreground text-sm">{error}</p>;
  }
  if (entries === null) {
    return <p className="text-muted-foreground text-sm">Loading activity…</p>;
  }
  return (
    <div className="space-y-3">
      <ActivityLog entries={entries} />
      {hasMore && (
        <div className="text-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => loadPage(entries.length)}
            disabled={pending}
          >
            {pending ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

/** AUD-2 — the Activity surface as a titled Card, dropped in as the last section
 *  on any entity detail page for a consistent position + look. */
export function ActivitySection({
  entityType,
  entityId,
}: {
  entityType: ActivityEntityType;
  entityId: string;
}) {
  return (
    <Card
      className="p-5 shadow-sm"
      style={{ background: "var(--brand-card)", borderColor: "var(--brand-border)" }}
    >
      <h2 className="text-brand-navy mb-3 font-serif text-lg">Activity</h2>
      <ActivityTimeline entityType={entityType} entityId={entityId} />
    </Card>
  );
}
