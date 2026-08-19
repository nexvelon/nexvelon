"use client";

// UIDG-8 — the dashboard shell: header + range, the "Customise" edit mode, and the
// grid. The RESOLVED layout arrives from the server (correct on first paint, no
// flash); this component only lets the user rearrange/remove/resize/add-back and
// persists on each committed change (not per drag frame). Below desktop, editing
// is disabled and the grid is a single ordered column.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Plus, RotateCcw, Building2, LayoutTemplate } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { RangePicker } from "@/components/modules/dashboard/RangePicker";
import { Button } from "@/components/ui/button";
import { ApplyDefaultDialog } from "@/components/settings/ApplyDefaultDialog";
import { useAuth } from "@/components/auth/AuthProvider";
import { DashboardRangeProvider } from "./range-context";
import { KpiDataProvider } from "./KpiDataProvider";
import { WidgetCatalog } from "./WidgetCatalog";
import { TemplatePicker } from "./TemplatePicker";
import { resolveWindow } from "@/lib/dashboard/range";
import { DashboardGrid } from "./DashboardGrid";
import {
  WIDGET_META,
  KPI_TILE_IDS,
  type DashboardLayout,
  type LayoutEntry,
  type WidgetId,
} from "@/lib/dashboard/widgets";
import type { DashboardTemplate } from "@/lib/dashboard/templates";
import {
  saveUserLayoutAction,
  resetUserLayoutAction,
  setOrgDefaultLayoutAction,
  countLayoutOverridesAction,
} from "@/app/(app)/dashboard/layout-actions";
import type { RangeKey } from "@/lib/date-range";

type SaveState = "idle" | "saving" | "saved" | "error";

function useIsDesktop(): boolean {
  // SSR renders the desktop grid (CSS collapses to one column on small screens
  // anyway); this only gates whether the Customise controls are offered.
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

interface Props {
  initialLayout: LayoutEntry[];
  /** Every widget this user may see — the pool for the "add back" menu. */
  visibleWidgetIds: WidgetId[];
  canManageOrg: boolean;
}

export function DashboardClient({ initialLayout, visibleWidgetIds, canManageOrg }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const isDesktop = useIsDesktop();

  const [range, setRange] = useState<RangeKey>("mtd");
  // UIDG-9 — custom range dates (yyyy-mm-dd from the date inputs). Seeded from the
  // current window when the user first switches to Custom, so it starts valid.
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const win = resolveWindow(range, { from: customFrom, to: customTo });

  function changeRange(next: RangeKey) {
    if (next === "custom" && !customFrom && !customTo) {
      const cur = resolveWindow(range);
      setCustomFrom(cur.from);
      setCustomTo(cur.to);
    }
    setRange(next);
  }
  const [editMode, setEditMode] = useState(false);
  const [layout, setLayout] = useState<LayoutEntry[]>(initialLayout);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // UIDG-10 — catalog + template pickers.
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  // Org-default dialog state (admin only). Carries the layout being pushed out —
  // the current arrangement (Save as company default) OR a chosen template.
  const [dialog, setDialog] = useState<{ count: number; layout: DashboardLayout } | null>(null);
  const [pendingOrg, startOrg] = useTransition();

  const now = new Date();
  const greeting =
    now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";
  const firstName = user?.name.split(" ")[0] ?? "there";

  const removed = useMemo(
    () => visibleWidgetIds.filter((id) => !layout.some((w) => w.id === id)),
    [visibleWidgetIds, layout]
  );
  const placedIds = useMemo(() => new Set(layout.map((w) => w.id)), [layout]);
  // The shared KPI fetch runs only when at least one KPI tile is on the dashboard
  // (2a — a layout with no tiles fires no KPI query).
  const hasKpiTiles = useMemo(
    () => layout.some((w) => (KPI_TILE_IDS as WidgetId[]).includes(w.id)),
    [layout]
  );

  // Persist a committed change (debounced so rapid resize clicks coalesce).
  function persist(next: LayoutEntry[]) {
    setLayout(next);
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const res = await saveUserLayoutAction({ widgets: next });
      setSaveState(res.ok ? "saved" : "error");
      if (!res.ok) toast.error(res.error);
    }, 500);
  }

  function reset() {
    startOrg(async () => {
      const res = await resetUserLayoutAction();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Reset to the company layout.");
      setEditMode(false);
      router.refresh(); // server re-resolves (org default / built-in)
    });
  }

  // UIDG-10 — add a widget from the catalog: appended at its default size, then
  // persisted. The duplicate rule (2e) is enforced here and by validateLayout.
  function addWidget(id: WidgetId) {
    if (layout.some((w) => w.id === id)) return;
    persist([...layout, { id, colSpan: WIDGET_META[id].defaultCols }]);
  }

  // UIDG-10 — apply a template to MY layout. Destructive (confirmed in the picker).
  // Reflows around the widgets I'm permitted to see (Step 6) — no gaps.
  function applyTemplate(template: DashboardTemplate) {
    const visible = new Set(visibleWidgetIds);
    const next = template.layout.widgets.filter((w) => visible.has(w.id));
    persist(next);
    toast.success(`Applied the ${template.name} template.`);
  }

  // Org-default: open the confirm dialog (or apply straight away when no personal
  // overrides exist) for a specific target layout — the current arrangement or a
  // chosen template. The stored org default stays UNFILTERED so each user reflows
  // it against their own permissions on resolve.
  function beginOrgDefault(target: DashboardLayout) {
    startOrg(async () => {
      const c = await countLayoutOverridesAction();
      const count = c.ok ? c.data.count : 0;
      if (count === 0) commitOrgDefault(target, false);
      else setDialog({ count, layout: target });
    });
  }

  function commitOrgDefault(target: DashboardLayout, applyToEveryone: boolean) {
    startOrg(async () => {
      const res = await setOrgDefaultLayoutAction(target, applyToEveryone);
      setDialog(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        applyToEveryone
          ? `Company default set — reset ${res.data.affected} personal layout(s)`
          : "Company default layout set"
      );
    });
  }

  const editable = isDesktop;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Fiscal Year ${now.getFullYear()} · Q${Math.floor(now.getMonth() / 3) + 1}`}
        title="Executive Dashboard"
        description={`${format(now, "EEEE, MMMM d, yyyy")} — ${greeting}, ${firstName}.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RangePicker value={range} onChange={changeRange} />
            {range === "custom" && (
              <div className="flex items-center gap-1.5 text-xs">
                <label className="sr-only" htmlFor="range-from">From date</label>
                <input
                  id="range-from"
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="border-brand-navy/15 rounded-md border px-2 py-1"
                />
                <span className="text-muted-foreground">→</span>
                <label className="sr-only" htmlFor="range-to">To date</label>
                <input
                  id="range-to"
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="border-brand-navy/15 rounded-md border px-2 py-1"
                />
              </div>
            )}
            {editable && (
              <Button
                variant={editMode ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => setEditMode((e) => !e)}
              >
                {editMode ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                {editMode ? "Done" : "Customise"}
              </Button>
            )}
          </div>
        }
      />

      {editable && editMode && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-md border p-2"
          style={{ borderColor: "var(--brand-border)" }}
        >
          <span className="text-muted-foreground text-xs">
            Drag the grip to reorder · use −/+ to resize · × to remove
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <SaveIndicator state={saveState} />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setCatalogOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Add widget
              {removed.length > 0 && (
                <span className="text-muted-foreground">({removed.length})</span>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setTemplatesOpen(true)}
            >
              <LayoutTemplate className="h-3.5 w-3.5" /> Templates
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={reset} disabled={pendingOrg}>
              <RotateCcw className="h-3.5 w-3.5" /> Reset to company layout
            </Button>
            {canManageOrg && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => beginOrgDefault({ widgets: layout })}
                disabled={pendingOrg}
              >
                <Building2 className="h-3.5 w-3.5" /> Save as company default
              </Button>
            )}
          </div>
        </div>
      )}

      {!editable && (
        <p className="text-muted-foreground text-xs">
          Rearranging your dashboard is available on a larger screen.
        </p>
      )}

      <DashboardRangeProvider value={win}>
        <KpiDataProvider active={hasKpiTiles}>
          <DashboardGrid
            layout={layout}
            editMode={editable && editMode}
            onReorder={persist}
            onRemove={(id) => persist(layout.filter((w) => w.id !== id))}
            onResize={(id, colSpan) =>
              persist(layout.map((w) => (w.id === id ? { ...w, colSpan } : w)))
            }
          />
        </KpiDataProvider>
      </DashboardRangeProvider>

      <WidgetCatalog
        open={catalogOpen}
        onOpenChange={setCatalogOpen}
        visibleWidgetIds={visibleWidgetIds}
        placedIds={placedIds}
        onAdd={addWidget}
      />

      <TemplatePicker
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        canManageOrg={canManageOrg}
        onApply={applyTemplate}
        onSetOrgDefault={(t) => beginOrgDefault(t.layout)}
      />

      {dialog && (
        <ApplyDefaultDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          subject="dashboard layout"
          targetName="this layout"
          affectedCount={dialog.count}
          pending={pendingOrg}
          onApplyToEveryone={() => commitOrgDefault(dialog.layout, true)}
          onKeepChoices={() => commitOrgDefault(dialog.layout, false)}
        />
      )}
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving")
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
      </span>
    );
  if (state === "saved")
    return (
      <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--brand-status-green)" }}>
        <Check className="h-3.5 w-3.5" /> Saved
      </span>
    );
  if (state === "error")
    return <span className="text-destructive text-xs">Couldn&rsquo;t save</span>;
  return null;
}
