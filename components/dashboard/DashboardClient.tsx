"use client";

// UIDG-8 — the dashboard shell: header + range, the "Customise" edit mode, and the
// grid. The RESOLVED layout arrives from the server (correct on first paint, no
// flash); this component only lets the user rearrange/remove/resize/add-back and
// persists on each committed change (not per drag frame). Below desktop, editing
// is disabled and the grid is a single ordered column.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Plus, RotateCcw, Building2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { RangePicker } from "@/components/modules/dashboard/RangePicker";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApplyDefaultDialog } from "@/components/settings/ApplyDefaultDialog";
import { useAuth } from "@/components/auth/AuthProvider";
import { DashboardRangeProvider } from "./range-context";
import { DashboardGrid } from "./DashboardGrid";
import { WIDGET_META, type LayoutEntry, type WidgetId } from "@/lib/dashboard/widgets";
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
  const [editMode, setEditMode] = useState(false);
  const [layout, setLayout] = useState<LayoutEntry[]>(initialLayout);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Org-default dialog state (admin only).
  const [dialog, setDialog] = useState<{ count: number } | null>(null);
  const [pendingOrg, startOrg] = useTransition();

  const now = new Date();
  const greeting =
    now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";
  const firstName = user?.name.split(" ")[0] ?? "there";

  const removed = useMemo(
    () => visibleWidgetIds.filter((id) => !layout.some((w) => w.id === id)),
    [visibleWidgetIds, layout]
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

  function saveAsOrgDefault() {
    startOrg(async () => {
      const c = await countLayoutOverridesAction();
      const count = c.ok ? c.data.count : 0;
      if (count === 0) {
        applyOrgDefault(false);
      } else {
        setDialog({ count });
      }
    });
  }

  function applyOrgDefault(applyToEveryone: boolean) {
    startOrg(async () => {
      const res = await setOrgDefaultLayoutAction({ widgets: layout }, applyToEveryone);
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
          <div className="flex items-center gap-2">
            <RangePicker value={range} onChange={setRange} />
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
          <div className="ml-auto flex items-center gap-2">
            <SaveIndicator state={saveState} />
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={removed.length === 0}
                className="border-brand-navy/15 text-brand-charcoal hover:bg-brand-gold/10 inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" /> Add widget
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="font-serif">Removed widgets</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {removed.map((id) => (
                  <DropdownMenuItem
                    key={id}
                    onClick={() =>
                      persist([...layout, { id, colSpan: WIDGET_META[id].defaultCols }])
                    }
                  >
                    {WIDGET_META[id].title}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={reset} disabled={pendingOrg}>
              <RotateCcw className="h-3.5 w-3.5" /> Reset to company layout
            </Button>
            {canManageOrg && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={saveAsOrgDefault}
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

      <DashboardRangeProvider value={range}>
        <DashboardGrid
          layout={layout}
          editMode={editable && editMode}
          onReorder={persist}
          onRemove={(id) => persist(layout.filter((w) => w.id !== id))}
          onResize={(id, colSpan) =>
            persist(layout.map((w) => (w.id === id ? { ...w, colSpan } : w)))
          }
        />
      </DashboardRangeProvider>

      {dialog && (
        <ApplyDefaultDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          subject="dashboard layout"
          targetName="your current layout"
          affectedCount={dialog.count}
          pending={pendingOrg}
          onApplyToEveryone={() => applyOrgDefault(true)}
          onKeepChoices={() => applyOrgDefault(false)}
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
