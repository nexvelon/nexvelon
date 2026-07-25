"use client";

// INV-9-2 — cycle counts. A count session snapshots expected on-hand at a scope,
// the counter enters a BLIND physical count (expected hidden by default), then
// variances are reviewed and applied through the adjustment ledger. Three in-tab
// views: list → count entry (blind) → review/apply. Applied/cancelled sessions
// are read-only history.

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ClipboardCheck,
  Eye,
  EyeOff,
  Plus,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  listCountSessionsAction,
  listCountScopeOptionsAction,
  getCountSessionAction,
  createCountSessionAction,
  enterCountAction,
  submitForReviewAction,
  applyCountAction,
  cancelCountAction,
} from "@/app/(app)/inventory/count-actions";
import type { DbCountLine, DbCountSession } from "@/lib/types/database";

type ScopeOptions = {
  locations: { id: string; name: string }[];
  categories: { id: string; name: string }[];
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  counting: "Counting",
  review: "Review",
  applied: "Applied",
  cancelled: "Cancelled",
};

export function CycleCountsTab() {
  const [selected, setSelected] = useState<string | null>(null);
  const [scope, setScope] = useState<ScopeOptions>({ locations: [], categories: [] });

  useEffect(() => {
    listCountScopeOptionsAction().then((r) => r.ok && setScope(r.data));
  }, []);

  if (selected) {
    return <CountDetail sessionId={selected} scope={scope} onBack={() => setSelected(null)} />;
  }
  return <CountList scope={scope} onOpen={setSelected} />;
}

// ── List ─────────────────────────────────────────────────────────────────────

function CountList({
  scope,
  onOpen,
}: {
  scope: ScopeOptions;
  onOpen: (id: string) => void;
}) {
  const [sessions, setSessions] = useState<DbCountSession[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [locId, setLocId] = useState("");
  const [catId, setCatId] = useState("");
  const [countedBy, setCountedBy] = useState("");
  const [pending, start] = useTransition();

  const load = () => listCountSessionsAction().then((r) => r.ok && setSessions(r.data));
  useEffect(() => { load(); }, []);

  const nameOf = (list: { id: string; name: string }[], id: string | null) =>
    id ? (list.find((x) => x.id === id)?.name ?? "—") : null;

  const create = () =>
    start(async () => {
      const res = await createCountSessionAction({
        locationId: locId || null,
        categoryId: catId || null,
        countedBy: countedBy.trim() || null,
      });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Count session created");
      setNewOpen(false);
      setLocId(""); setCatId(""); setCountedBy("");
      onOpen(res.data.id);
    });

  return (
    <Card className="bg-card p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="text-brand-navy h-4 w-4" />
          <h3 className="text-brand-navy font-serif text-base">Cycle counts</h3>
        </div>
        <Button type="button" size="xs" onClick={() => setNewOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> New count
        </Button>
      </div>

      {sessions.length === 0 ? (
        <p className="text-muted-foreground text-[12px]">
          No cycle counts yet. Start one to snapshot expected stock at a location,
          count it blind, review variances, and apply the adjustments.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] uppercase">Reference</TableHead>
                <TableHead className="text-[11px] uppercase">Scope</TableHead>
                <TableHead className="text-[11px] uppercase">Status</TableHead>
                <TableHead className="text-[11px] uppercase">Opened</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => {
                const loc = nameOf(scope.locations, s.location_id);
                const cat = nameOf(scope.categories, s.category_id);
                const scopeLabel = [loc, cat].filter(Boolean).join(" · ") || "All stock";
                return (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer"
                    onClick={() => onOpen(s.id)}
                  >
                    <TableCell className="font-mono text-xs">{s.reference}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{scopeLabel}</TableCell>
                    <TableCell><StatusBadge status={s.status} /></TableCell>
                    <TableCell className="text-muted-foreground text-xs tabular-nums">
                      {s.opened_at.slice(0, 10)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New cycle count</DialogTitle>
            <DialogDescription>
              Snapshots the current expected on-hand at the chosen scope. Leave both
              blank to count all physically-located stock.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block">
              <span className="text-muted-foreground text-[11px] uppercase tracking-wide">Location</span>
              <select
                value={locId}
                onChange={(e) => setLocId(e.target.value)}
                className="mt-1 w-full rounded-md border bg-card px-2 py-1.5 text-sm"
                style={{ borderColor: "var(--brand-border)" }}
              >
                <option value="">All locations</option>
                {scope.locations.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
              </select>
            </label>
            <label className="block">
              <span className="text-muted-foreground text-[11px] uppercase tracking-wide">Category</span>
              <select
                value={catId}
                onChange={(e) => setCatId(e.target.value)}
                className="mt-1 w-full rounded-md border bg-card px-2 py-1.5 text-sm"
                style={{ borderColor: "var(--brand-border)" }}
              >
                <option value="">All categories</option>
                {scope.categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </label>
            <label className="block">
              <span className="text-muted-foreground text-[11px] uppercase tracking-wide">Counted by</span>
              <Input
                value={countedBy}
                onChange={(e) => setCountedBy(e.target.value)}
                placeholder="Name (optional)"
                className="mt-1"
              />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="button" onClick={create} disabled={pending}>
              {pending ? "Creating…" : "Create + snapshot"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Detail (entry / review / history) ────────────────────────────────────────

function CountDetail({
  sessionId,
  scope,
  onBack,
}: {
  sessionId: string;
  scope: ScopeOptions;
  onBack: () => void;
}) {
  const [session, setSession] = useState<DbCountSession | null>(null);
  const [lines, setLines] = useState<DbCountLine[]>([]);
  const [reveal, setReveal] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [pending, start] = useTransition();

  const load = () =>
    getCountSessionAction(sessionId).then((r) => {
      if (r.ok) { setSession(r.data.session); setLines(r.data.lines); }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [sessionId]);

  const summary = useMemo(() => {
    let counted = 0, uncounted = 0, netQty = 0, netVal = 0;
    for (const l of lines) {
      if (l.counted_qty == null) { uncounted++; continue; }
      counted++;
      const v = Number(l.counted_qty) - Number(l.expected_qty);
      netQty += v;
      netVal += v * Number(l.unit_cost_snapshot ?? 0);
    }
    return { counted, uncounted, netQty, netVal };
  }, [lines]);

  if (!session) return <Card className="bg-card p-6 shadow-sm"><p className="text-muted-foreground text-sm">Loading…</p></Card>;

  const editing = session.status === "open" || session.status === "counting";
  const reviewing = session.status === "review";

  const loc = session.location_id ? scope.locations.find((l) => l.id === session.location_id)?.name : null;
  const cat = session.category_id ? scope.categories.find((c) => c.id === session.category_id)?.name : null;

  const saveCount = (lineId: string, raw: string) => {
    const trimmed = raw.trim();
    const qty = trimmed === "" ? null : Number(trimmed);
    if (qty != null && (!Number.isFinite(qty) || qty < 0)) { toast.error("Enter a number ≥ 0"); return; }
    // optimistic local update so the field keeps its value
    setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, counted_qty: qty } : l)));
    enterCountAction(lineId, qty).then((r) => { if (!r.ok) toast.error(r.error); });
  };

  const submit = () =>
    start(async () => {
      const r = await submitForReviewAction(sessionId);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success("Submitted for review");
      load();
    });

  const apply = () =>
    start(async () => {
      const r = await applyCountAction(sessionId);
      if (!r.ok) { toast.error(r.error); return; }
      setApplyOpen(false);
      toast.success(
        `Applied — ${r.data.adjusted} adjusted, ${r.data.skipped_uncounted} uncounted skipped` +
          (r.data.failed ? `, ${r.data.failed} failed` : "")
      );
      load();
    });

  const cancel = () =>
    start(async () => {
      const r = await cancelCountAction(sessionId);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success("Count cancelled");
      load();
    });

  return (
    <Card className="bg-card p-4 shadow-sm">
      <button type="button" onClick={onBack} className="text-muted-foreground hover:text-brand-charcoal mb-3 inline-flex items-center gap-1.5 text-[12px] font-medium">
        <ArrowLeft className="h-3.5 w-3.5" /> All counts
      </button>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-brand-navy font-serif text-base">{session.reference}</h3>
            <StatusBadge status={session.status} />
          </div>
          <p className="text-muted-foreground mt-0.5 text-[11px]">
            {[loc, cat].filter(Boolean).join(" · ") || "All stock"}
            {session.counted_by ? ` · counted by ${session.counted_by}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {editing && (
            <>
              <Button type="button" size="xs" variant="outline" onClick={() => setReveal((v) => !v)}>
                {reveal ? <EyeOff className="mr-1 h-3.5 w-3.5" /> : <Eye className="mr-1 h-3.5 w-3.5" />}
                {reveal ? "Hide expected" : "Reveal expected"}
              </Button>
              <Button type="button" size="xs" onClick={submit} disabled={pending}>Submit for review</Button>
            </>
          )}
          {reviewing && (
            <>
              <Button type="button" size="xs" variant="outline" onClick={cancel} disabled={pending}>Cancel</Button>
              <Button type="button" size="xs" onClick={() => setApplyOpen(true)} disabled={pending}>Apply adjustments</Button>
            </>
          )}
        </div>
      </div>

      {lines.length === 0 ? (
        <p className="text-muted-foreground text-[12px]">No stock at this scope to count.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] uppercase">Part</TableHead>
                <TableHead className="text-[11px] uppercase">SKU / Serial</TableHead>
                {(!editing || reveal) && <TableHead className="text-right text-[11px] uppercase">Expected</TableHead>}
                <TableHead className="text-right text-[11px] uppercase">Counted</TableHead>
                {!editing && <TableHead className="text-right text-[11px] uppercase">Variance</TableHead>}
                {!editing && <TableHead className="text-right text-[11px] uppercase">Δ Value</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => {
                const counted = l.counted_qty;
                const vQty = counted != null ? Number(counted) - Number(l.expected_qty) : null;
                const vVal = vQty != null ? vQty * Number(l.unit_cost_snapshot ?? 0) : null;
                return (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs" style={{ color: "var(--brand-primary)" }}>{l.product_label ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {l.serial_snapshot ? l.serial_snapshot : (l.sku_snapshot ?? "—")}
                    </TableCell>
                    {(!editing || reveal) && (
                      <TableCell className="text-right text-xs tabular-nums">{Number(l.expected_qty)}</TableCell>
                    )}
                    <TableCell className="text-right">
                      {editing ? (
                        <input
                          type="number"
                          min={0}
                          defaultValue={counted ?? ""}
                          onBlur={(e) => saveCount(l.id, e.target.value)}
                          className="w-20 rounded-md border px-2 py-1 text-right text-xs tabular-nums"
                          style={{ borderColor: "var(--brand-border)" }}
                        />
                      ) : (
                        <span className={cn("text-xs tabular-nums", counted == null && "text-muted-foreground")}>
                          {counted == null ? "uncounted" : Number(counted)}
                        </span>
                      )}
                    </TableCell>
                    {!editing && (
                      <TableCell className={cn("text-right text-xs font-semibold tabular-nums", vQty != null && vQty > 0 ? "text-[var(--brand-status-green)]" : vQty != null && vQty < 0 ? "text-red-600" : "text-muted-foreground")}>
                        {vQty == null ? "—" : `${vQty > 0 ? "+" : ""}${vQty}`}
                      </TableCell>
                    )}
                    {!editing && (
                      <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                        {vVal == null ? "—" : `${vVal > 0 ? "+" : ""}${formatCurrency(vVal)}`}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {!editing && lines.length > 0 && (
        <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
          <span>{summary.counted} counted · {summary.uncounted} uncounted</span>
          <span>Net variance: {summary.netQty > 0 ? "+" : ""}{summary.netQty} units</span>
          <span>Net value: {summary.netVal > 0 ? "+" : ""}{formatCurrency(summary.netVal)}</span>
        </div>
      )}
      {editing && (
        <p className="text-muted-foreground mt-3 text-[11px]">
          Blind count — expected is hidden while you enter. Leave a line empty to
          leave it uncounted; uncounted lines are never adjusted on apply.
        </p>
      )}

      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply cycle-count adjustments?</DialogTitle>
            <DialogDescription>
              Posts stock adjustments for the {summary.counted} counted line(s) with a
              variance, bringing each to its counted quantity. Net inventory value
              impact: <strong>{summary.netVal > 0 ? "+" : ""}{formatCurrency(summary.netVal)}</strong>.
              {summary.uncounted > 0 && ` ${summary.uncounted} uncounted line(s) are left untouched.`}
              This is recorded on the movement ledger and can&rsquo;t be undone here.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setApplyOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="button" onClick={apply} disabled={pending}>{pending ? "Applying…" : "Apply adjustments"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    open: "bg-slate-100 text-slate-700",
    counting: "bg-blue-100 text-blue-700",
    review: "bg-amber-100 text-amber-700",
    applied: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-slate-100 text-slate-500",
  };
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", tone[status] ?? "bg-slate-100 text-slate-700")}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
