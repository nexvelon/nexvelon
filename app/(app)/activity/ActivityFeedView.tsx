"use client";

// AUD-3 — the central Activity feed UI. Filters (actor, entity type, date range,
// action, free text) live in the URL, so a filtered view is shareable and
// survives reload; changing one pushes a new URL and the server re-renders page
// 0. "Load more" and "Export CSV" call server actions with the current filters —
// both go through the same permission-scoped query as the page.

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Filter, Search, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RangePicker } from "@/components/modules/dashboard/RangePicker";
import { ActivityFeedList } from "@/components/activity/ActivityFeedList";
import { downloadReport } from "@/lib/reports/download";
import {
  loadActivityFeedAction,
  exportActivityFeedAction,
  type ActivityFeedInput,
  type ActivityFeedPage,
} from "./actions";
import {
  ACTIVITY_ENTITY_TYPES,
  type ActivityEntityType,
  type DbActivityLogWithActor,
} from "@/lib/types/database";
import { ENTITY_TYPE_LABEL } from "@/lib/activity-access";
import type { RangeKey } from "@/lib/date-range";
import type { ActivityActor } from "@/lib/api/activity-log";
import { toast } from "sonner";

interface Props {
  actors: ActivityActor[];
  input: ActivityFeedInput;
  initial: ActivityFeedPage;
  /** Hide the actor filter (the per-user view fixes the actor). */
  lockActor?: boolean;
  /** The viewer may open other users' activity (users:view). */
  canMonitor?: boolean;
  /** The viewer's own id — they may always open their own activity. */
  meId?: string;
}

export function ActivityFeedView({
  actors,
  input,
  initial,
  lockActor,
  canMonitor,
  meId,
}: Props) {
  // Built client-side (a function can't cross the server→client prop boundary):
  // link an actor name to their activity view iff the viewer may monitor others
  // or it is the viewer themselves.
  const actorHref = (actorId: string | null): string | null =>
    actorId && (canMonitor || actorId === meId)
      ? `/users/${actorId}/activity`
      : null;
  const router = useRouter();
  const params = useSearchParams();

  // Appended pages (load-more) on top of the server-rendered page 0. Reset
  // whenever the server sends a fresh page 0 (i.e. filters changed).
  const [extra, setExtra] = useState<DbActivityLogWithActor[]>([]);
  const [liveKeys, setLiveKeys] = useState<Set<string>>(
    () => new Set(initial.liveKeys)
  );
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [pending, start] = useTransition();
  useEffect(() => {
    setExtra([]);
    setLiveKeys(new Set(initial.liveKeys));
    setHasMore(initial.hasMore);
  }, [initial]);

  const entries = useMemo(
    () => [...initial.entries, ...extra],
    [initial.entries, extra]
  );

  const selectedTypes = new Set(input.entityTypes ?? []);

  function pushFilters(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.push(`?${next.toString()}`);
  }

  function toggleType(t: ActivityEntityType) {
    const nextSet = new Set(selectedTypes);
    if (nextSet.has(t)) nextSet.delete(t);
    else nextSet.add(t);
    pushFilters({ types: nextSet.size ? [...nextSet].join(",") : null });
  }

  const [text, setText] = useState(input.q ?? "");
  useEffect(() => setText(input.q ?? ""), [input.q]);

  function loadMore() {
    start(async () => {
      const res = await loadActivityFeedAction({ ...input, offset: entries.length });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setExtra((prev) => [...prev, ...res.page.entries]);
      setLiveKeys((prev) => new Set([...prev, ...res.page.liveKeys]));
      setHasMore(res.page.hasMore);
    });
  }

  function exportCsv() {
    start(async () => {
      const res = await exportActivityFeedAction(input);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      downloadReport(res.export);
      if (res.truncated) {
        toast.warning(
          `Export capped at the first rows in range — narrow the filters for a complete export.`
        );
      }
    });
  }

  const anyFilter =
    !!input.actorId ||
    (input.entityTypes?.length ?? 0) > 0 ||
    !!input.action ||
    !!(input.q && input.q.trim());

  const typeLabel =
    selectedTypes.size === 0
      ? "All types"
      : selectedTypes.size === 1
        ? ENTITY_TYPE_LABEL[[...selectedTypes][0] as keyof typeof ENTITY_TYPE_LABEL]
        : `${selectedTypes.size} types`;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <RangePicker
          value={(input.range ?? "mtd") as RangeKey}
          onChange={(key) => pushFilters({ range: key, from: null, to: null })}
        />

        {!lockActor && (
          <Select
            value={input.actorId ?? "all"}
            onValueChange={(v) => pushFilters({ actor: v === "all" ? null : v })}
          >
            <SelectTrigger className="h-9 w-44 text-sm">
              <SelectValue placeholder="All actors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actors</SelectItem>
              {actors.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            className={buttonVariants({ variant: "outline", size: "sm", className: "gap-2" })}
          >
            <Filter className="h-3.5 w-3.5" />
            {typeLabel}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
            <DropdownMenuLabel className="font-serif">Entity types</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ACTIVITY_ENTITY_TYPES.map((t) => (
              <DropdownMenuCheckboxItem
                key={t}
                checked={selectedTypes.has(t)}
                onCheckedChange={() => toggleType(t)}
                onSelect={(e) => e.preventDefault()}
              >
                {ENTITY_TYPE_LABEL[t]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Select
          value={input.action ?? "all"}
          onValueChange={(v) => pushFilters({ action: v === "all" ? null : v })}
        >
          <SelectTrigger className="h-9 w-36 text-sm">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            <SelectItem value="create">Created</SelectItem>
            <SelectItem value="update">Updated</SelectItem>
            <SelectItem value="delete">Deleted</SelectItem>
          </SelectContent>
        </Select>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            pushFilters({ q: text.trim() || null });
          }}
          className="relative"
        >
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search records…"
            className="h-9 w-52 pl-8 text-sm"
          />
        </form>

        {anyFilter && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1"
            onClick={() => router.push("?")}
          >
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        )}

        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={exportCsv}
            disabled={pending || entries.length === 0}
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Feed */}
      {entries.length === 0 ? (
        <div
          className="rounded-md border p-8 text-center"
          style={{ borderColor: "var(--brand-border)" }}
        >
          <p className="text-muted-foreground text-sm">
            {anyFilter
              ? "No activity matches these filters."
              : "No activity recorded in this range."}
          </p>
        </div>
      ) : (
        <>
          <ActivityFeedList entries={entries} liveKeys={liveKeys} linkActorHref={actorHref} />
          {hasMore && (
            <div className="text-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={loadMore}
                disabled={pending}
              >
                {pending ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
