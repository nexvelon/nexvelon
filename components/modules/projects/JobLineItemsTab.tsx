"use client";

// PROJ2-6a — the Job line-item editor (parts + labour). Mirrors the quote
// builder's two-way binding: editing cost holds the row's margin and updates the
// sell price; editing sell price updates the (derived) margin; editing margin
// updates the sell price. Quoted values are shown as diff pills when the live
// (Estimated) value has drifted from the snapshot. Reordering uses the same
// @dnd-kit sortable pattern as the quote builder (drag handle only). Cost-center
// contract_value sync + the Quoted/Estimated/Actual variance panel are PROJ2-6b.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Copy, Trash2, Plus, Package, Wrench } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CurrencyInput } from "@/components/modules/quotes/builder/CurrencyInput";
import { formatCurrency } from "@/lib/format";
import { round2 } from "@/lib/quote-helpers";
import {
  computeJobLineItemTotals,
  computeQuotedEstimatedLegs,
} from "@/lib/jobs/totals";
import { cn } from "@/lib/utils";
import {
  createJobLineItemAction,
  updateJobLineItemAction,
  deleteJobLineItemAction,
  cloneJobLineItemAction,
  reorderJobLineItemsAction,
} from "@/app/(app)/projects/actions";
import type { DbJobLineItem, DbProjectCostCenter } from "@/lib/types/database";

type KindFilter = "all" | "part" | "labour";

// Derived margin (SP-based) from a row's cost + price. No stored margin column —
// margin is purely a function of unit_cost / unit_price (bugfix definition).
function deriveMargin(unitCost: number, unitPrice: number): number {
  return unitPrice > 0 ? round2((1 - unitCost / unitPrice) * 100) : 0;
}

function lineSell(li: DbJobLineItem): number {
  return round2(
    li.quantity * li.unit_price * (1 - (li.discount_pct || 0) / 100)
  );
}
function lineCost(li: DbJobLineItem): number {
  return round2(li.quantity * li.unit_cost);
}

export function JobLineItemsTab({
  jobId,
  initialItems,
  costCenters,
  canEdit,
  canViewFinancials,
}: {
  jobId: string;
  initialItems: DbJobLineItem[];
  costCenters: DbProjectCostCenter[];
  canEdit: boolean;
  canViewFinancials: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<DbJobLineItem[]>(initialItems);
  const [filter, setFilter] = useState<KindFilter>("all");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DbJobLineItem | null>(null);
  const [busy, setBusy] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const visible = items.filter((li) =>
    filter === "all" ? true : li.line_kind === filter
  );
  const totals = computeJobLineItemTotals(items);
  // PROJ2-6b — quoted contract (Σ quoted sell totals) vs the current live sell.
  const { quoted, hasQuotedBaseline } = computeQuotedEstimatedLegs(items);
  const quotedDrift = round2(totals.sellAfterDiscount - quoted.revenue);
  const money = (n: number | null) =>
    canViewFinancials && n != null ? formatCurrency(n) : "—";

  // ── Local + server sync ────────────────────────────────────────────────────

  function patchLocal(id: string, dbPatch: Partial<DbJobLineItem>) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...dbPatch } : it))
    );
  }

  async function commit(
    id: string,
    dbPatch: Partial<DbJobLineItem>,
    apiPatch: Parameters<typeof updateJobLineItemAction>[0]["patch"]
  ) {
    patchLocal(id, dbPatch);
    const res = await updateJobLineItemAction({ id, patch: apiPatch });
    if (!res.ok) {
      toast.error(`Couldn't save: ${res.error}`);
      router.refresh();
    }
  }

  // Field edits (two-way binding lives here).
  const editQty = (li: DbJobLineItem, v: number) =>
    commit(li.id, { quantity: v }, { quantity: v });

  const editCost = (li: DbJobLineItem, v: number) => {
    const margin = deriveMargin(li.unit_cost, li.unit_price);
    const price = margin >= 100 ? v : round2(v / (1 - margin / 100));
    commit(li.id, { unit_cost: v, unit_price: price }, { unitCost: v, unitPrice: price });
  };

  const editPrice = (li: DbJobLineItem, v: number) =>
    commit(li.id, { unit_price: v }, { unitPrice: v });

  const editMargin = (li: DbJobLineItem, m: number) => {
    const price = m >= 100 ? li.unit_cost : round2(li.unit_cost / (1 - m / 100));
    commit(li.id, { unit_price: price }, { unitPrice: price });
  };

  const editDiscount = (li: DbJobLineItem, v: number) =>
    commit(li.id, { discount_pct: v }, { discountPct: v });

  const editText = (
    li: DbJobLineItem,
    field: "description" | "item_code",
    v: string
  ) => {
    const trimmed = v.trim();
    if (field === "description") {
      const desc = trimmed || "Item";
      if (desc === li.description) return;
      commit(li.id, { description: desc }, { description: desc });
    } else {
      const code = trimmed || null;
      if (code === li.item_code) return;
      commit(li.id, { item_code: code }, { itemCode: code });
    }
  };

  // ── Set mutations ──────────────────────────────────────────────────────────

  async function addLine(kind: "part" | "labour") {
    setBusy(true);
    // Labour defaults mirror the quote builder's laborLineItem (8h @ $145 sell,
    // 40% margin → $87 cost). Parts start blank at 40% margin (price 0).
    const base =
      kind === "labour"
        ? { description: "Labour", quantity: 8, unitCost: 87, unitPrice: 145 }
        : { description: "", quantity: 1, unitCost: 0, unitPrice: 0 };
    const res = await createJobLineItemAction({
      jobId,
      costCenterId: costCenters[0]?.id ?? null,
      lineKind: kind,
      itemCode: null,
      description: base.description,
      category: kind === "labour" ? "Technician Labour" : "Materials",
      quantity: base.quantity,
      unitCost: base.unitCost,
      unitPrice: base.unitPrice,
      discountPct: 0,
      taxable: true,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setItems((prev) => [...prev, res.data]);
    router.refresh(); // keep the tab badge + rollup fresh
  }

  async function clone(li: DbJobLineItem) {
    setBusy(true);
    const res = await cloneJobLineItemAction(li.id);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    // Insert the clone right after the original locally.
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.id === li.id);
      const next = [...prev];
      next.splice(idx + 1, 0, res.data);
      return next;
    });
    router.refresh();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    const prev = items;
    setItems((cur) => cur.filter((x) => x.id !== id));
    const res = await deleteJobLineItemAction(id);
    if (!res.ok) {
      toast.error(res.error);
      setItems(prev); // rollback
      return;
    }
    toast.success("Line deleted");
    router.refresh();
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((x) => x.id === active.id);
    const newIdx = items.findIndex((x) => x.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(items, oldIdx, newIdx);
    setItems(reordered);
    const res = await reorderJobLineItemsAction({
      jobId,
      orderedIds: reordered.map((x) => x.id),
    });
    if (!res.ok) {
      toast.error(res.error);
      router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {(["all", "part", "labour"] as KindFilter[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                filter === k
                  ? "bg-brand-navy text-white"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {k === "all" ? "All" : k === "part" ? "Parts" : "Labour"}
            </button>
          ))}
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => addLine("part")}>
              <Package className="mr-1.5 h-3.5 w-3.5" /> Add part
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => addLine("labour")}>
              <Wrench className="mr-1.5 h-3.5 w-3.5" /> Add labour
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setCatalogOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add from catalog
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      {visible.length === 0 ? (
        <Card className="bg-card p-8 text-center">
          <p className="text-muted-foreground text-sm">
            {items.length === 0
              ? "No line items yet."
              : `No ${filter} lines.`}
            {canEdit && items.length === 0
              ? " Add a part or labour line to start."
              : ""}
          </p>
        </Card>
      ) : (
        <Card className="bg-card overflow-hidden p-0 shadow-sm">
          <div className="overflow-x-auto">
            <div className="min-w-[1000px]">
              {/* Header */}
              <div className="text-muted-foreground grid grid-cols-[24px_64px_100px_1fr_70px_90px_90px_64px_64px_90px_90px_60px] items-center gap-2 border-b border-[var(--border)] px-3 py-2 text-[10px] uppercase tracking-wider">
                <span />
                <span>Kind</span>
                <span>Code</span>
                <span>Description</span>
                <span className="text-right">Qty/Hrs</span>
                <span className="text-right">Unit cost</span>
                <span className="text-right">Unit price</span>
                <span className="text-right">Disc %</span>
                <span className="text-right">Margin %</span>
                <span className="text-right">Sell</span>
                <span className="text-right">Cost</span>
                <span className="text-right">Actions</span>
              </div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={visible.map((x) => x.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {visible.map((li) => (
                    <JobLineRow
                      key={li.id}
                      li={li}
                      canEdit={canEdit}
                      canViewFinancials={canViewFinancials}
                      onQty={editQty}
                      onCost={editCost}
                      onPrice={editPrice}
                      onMargin={editMargin}
                      onDiscount={editDiscount}
                      onText={editText}
                      onClone={clone}
                      onDelete={setPendingDelete}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          </div>

          {/* Sticky footer totals */}
          <div className="bg-muted/40 grid grid-cols-2 gap-x-6 gap-y-1 border-t border-[var(--border)] px-4 py-3 text-sm sm:grid-cols-6">
            <Footer label="Sell (pre-disc)" value={formatCurrency(totals.sellSubtotal)} />
            <Footer label="Discount" value={`−${formatCurrency(totals.discountTotal)}`} />
            <Footer label="Sell (post)" value={formatCurrency(totals.sellAfterDiscount)} accent />
            <Footer label="Cost" value={money(totals.costTotal)} />
            <Footer label="Profit" value={money(totals.profit)} />
            <Footer
              label="Margin"
              value={
                !canViewFinancials
                  ? "—"
                  : totals.marginPct == null
                    ? "—"
                    : `${totals.marginPct.toFixed(1)}%`
              }
              accent
            />
          </div>

          {/* PROJ2-6b — quoted-vs-current summary; only when a quoted baseline
              exists. Financials-gated. */}
          {hasQuotedBaseline && canViewFinancials && (
            <div className="border-t border-[var(--border)] px-4 py-2">
              <p className="text-muted-foreground text-xs tabular-nums">
                Quoted contract:{" "}
                <span className="text-brand-charcoal font-medium">
                  {formatCurrency(quoted.revenue)}
                </span>{" "}
                · Current:{" "}
                <span className="text-brand-charcoal font-medium">
                  {formatCurrency(totals.sellAfterDiscount)}
                </span>{" "}
                <span
                  className={cn(
                    "font-medium",
                    Math.abs(quotedDrift) < 0.005
                      ? "text-muted-foreground"
                      : quotedDrift > 0
                        ? "text-[var(--brand-status-green)]"
                        : "text-destructive"
                  )}
                >
                  ({quotedDrift > 0 ? "+" : quotedDrift < 0 ? "−" : ""}
                  {formatCurrency(Math.abs(quotedDrift))})
                </span>
              </p>
            </div>
          )}
        </Card>
      )}

      {/* Add-from-catalog placeholder */}
      <Dialog open={catalogOpen} onOpenChange={setCatalogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add from catalog</DialogTitle>
            <DialogDescription>
              Searching the parts catalog to add priced lines is coming in
              PROJ2-6a-catalog. For now, use “Add part” / “Add labour” and fill in
              the details.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={() => setCatalogOpen(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this line?</DialogTitle>
            <DialogDescription>
              {pendingDelete?.description} — this can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmDelete}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────

function JobLineRow({
  li,
  canEdit,
  canViewFinancials,
  onQty,
  onCost,
  onPrice,
  onMargin,
  onDiscount,
  onText,
  onClone,
  onDelete,
}: {
  li: DbJobLineItem;
  canEdit: boolean;
  canViewFinancials: boolean;
  onQty: (li: DbJobLineItem, v: number) => void;
  onCost: (li: DbJobLineItem, v: number) => void;
  onPrice: (li: DbJobLineItem, v: number) => void;
  onMargin: (li: DbJobLineItem, v: number) => void;
  onDiscount: (li: DbJobLineItem, v: number) => void;
  onText: (li: DbJobLineItem, field: "description" | "item_code", v: string) => void;
  onClone: (li: DbJobLineItem) => void;
  onDelete: (li: DbJobLineItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: li.id, disabled: !canEdit });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const isLabour = li.line_kind === "labour";
  const margin = deriveMargin(li.unit_cost, li.unit_price);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[24px_64px_100px_1fr_70px_90px_90px_64px_64px_90px_90px_60px] items-center gap-2 border-b border-[var(--border)] px-3 py-1.5 last:border-0"
    >
      <button
        type="button"
        className={cn(
          "text-muted-foreground/50 flex items-center justify-center",
          canEdit ? "cursor-grab hover:text-brand-charcoal" : "cursor-default opacity-30"
        )}
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <span
        className={cn(
          "inline-flex w-fit items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
          isLabour
            ? "bg-amber-100 text-amber-800"
            : "bg-slate-100 text-slate-600"
        )}
      >
        {isLabour ? "Labour" : "Part"}
      </span>

      {/* Item code — parts only */}
      {isLabour ? (
        <span className="text-muted-foreground text-center text-xs">—</span>
      ) : (
        <Input
          defaultValue={li.item_code ?? ""}
          onBlur={(e) => onText(li, "item_code", e.target.value)}
          disabled={!canEdit}
          className="h-7 text-xs"
          placeholder="SKU"
        />
      )}

      <div className="flex items-center gap-1">
        <Input
          defaultValue={li.description}
          onBlur={(e) => onText(li, "description", e.target.value)}
          disabled={!canEdit}
          className="h-7 text-xs"
        />
      </div>

      <div className="flex items-center justify-end gap-1">
        <DiffPill current={li.quantity} quoted={li.quoted_quantity} />
        <CurrencyInput
          value={li.quantity}
          onChange={(v) => onQty(li, v)}
          disabled={!canEdit}
          className="h-7 w-full text-xs"
        />
      </div>

      <div className="flex items-center justify-end gap-1">
        <DiffPill current={li.unit_cost} quoted={li.quoted_unit_cost} money />
        <CurrencyInput
          value={li.unit_cost}
          onChange={(v) => onCost(li, v)}
          disabled={!canEdit}
          className="h-7 w-full text-xs"
        />
      </div>

      <div className="flex items-center justify-end gap-1">
        <DiffPill current={li.unit_price} quoted={li.quoted_unit_price} money />
        <CurrencyInput
          value={li.unit_price}
          onChange={(v) => onPrice(li, v)}
          disabled={!canEdit}
          className="h-7 w-full text-xs"
        />
      </div>

      <CurrencyInput
        value={li.discount_pct}
        onChange={(v) => onDiscount(li, v)}
        disabled={!canEdit}
        className="h-7 text-xs"
      />

      <CurrencyInput
        value={margin}
        onChange={(v) => onMargin(li, v)}
        disabled={!canEdit}
        className="h-7 text-xs"
      />

      <span className="text-brand-charcoal text-right text-xs font-semibold tabular-nums">
        {formatCurrency(lineSell(li))}
      </span>
      <span className="text-muted-foreground text-right text-xs tabular-nums">
        {canViewFinancials ? formatCurrency(lineCost(li)) : "—"}
      </span>

      <div className="flex items-center justify-end gap-0.5">
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => onClone(li)}
              className="text-muted-foreground hover:text-brand-charcoal p-1"
              title="Clone line"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(li)}
              className="text-muted-foreground p-1 hover:text-red-600"
              title="Delete line"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// A small "changed" pill shown when a field's live value differs from its quoted
// snapshot. Only renders when a snapshot exists (quoted != null).
function DiffPill({
  current,
  quoted,
  money,
}: {
  current: number;
  quoted: number | null;
  money?: boolean;
}) {
  if (quoted == null || round2(current) === round2(quoted)) return null;
  const q = money ? formatCurrency(quoted) : String(quoted);
  return (
    <span
      className="rounded-sm bg-amber-100 px-1 text-[9px] font-medium text-amber-700"
      title={`Quoted: ${q}`}
    >
      ≠
    </span>
  );
}

function Footer({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-[10px] uppercase tracking-wider">
        {label}
      </p>
      <p
        className={cn(
          "tabular-nums",
          accent
            ? "text-brand-navy font-serif text-base"
            : "text-brand-charcoal text-sm"
        )}
      >
        {value}
      </p>
    </div>
  );
}
