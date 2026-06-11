"use client";

// PO-2/PO-3 — create/edit/detail drawer for a purchase order. A DRAFT PO is
// fully editable (header + line editor). Any other status renders READ-ONLY
// detail (protecting received_qty from the draft full-replace path) plus the
// status actions (issue / cancel / close / admin-reopen).

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { useRole } from "@/lib/role-context";
import {
  cancelPurchaseOrderAction,
  closePurchaseOrderAction,
  createPurchaseOrderAction,
  issuePurchaseOrderAction,
  reopenPurchaseOrderAction,
  updatePurchaseOrderAction,
} from "@/app/(app)/purchase-orders/actions";
import {
  CategorySubcategoryFilter,
  matchesCatFilter,
  type CatFilterValue,
} from "@/components/modules/inventory/CategorySubcategoryFilter";
import {
  StatusBadge,
  canCancel,
  canClose,
  canIssue,
  canReceive,
  canReopen,
  isEditableStatus,
} from "./po-status";
import { ReceivePanel } from "./ReceivePanel";
import type { PurchaseOrderDetail } from "@/lib/api/purchase-orders";
import type { DbPurchaseOrderStatus } from "@/lib/types/database";

export interface VendorOption {
  id: string;
  name: string;
}
export interface ProductOption {
  id: string;
  sku: string;
  name: string;
  cost: number;
  // CAT-3b: for the category / sub-category line-picker filter.
  category?: string;
  subcategory?: string;
}

type Mode =
  | { kind: "create" }
  | { kind: "edit"; detail: PurchaseOrderDetail };

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  mode: Mode;
  vendorOptions: VendorOption[];
  productOptions: ProductOption[];
  locationOptions: string[];
}

interface LineDraft {
  key: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_cost: number;
}

let keySeq = 0;
function newLine(): LineDraft {
  keySeq += 1;
  return {
    key: `l${keySeq}`,
    product_id: null,
    description: "",
    quantity: 1,
    unit_cost: 0,
  };
}

export function PurchaseOrderFormDrawer({
  open,
  onClose,
  onSaved,
  mode,
  vendorOptions,
  productOptions,
  locationOptions,
}: Props) {
  const isEdit = mode.kind === "edit";
  const init = mode.kind === "edit" ? mode.detail : null;
  const status: DbPurchaseOrderStatus =
    mode.kind === "edit" ? mode.detail.header.status : "draft";
  const editable = mode.kind === "create" || isEditableStatus(status);
  const { role } = useRole();
  const isAdmin = role === "Admin";
  const [receiving, setReceiving] = useState(false);

  const [vendorId, setVendorId] = useState(init?.header.vendor_id ?? "");
  const [orderDate, setOrderDate] = useState(init?.header.order_date ?? "");
  const [expectedDate, setExpectedDate] = useState(
    init?.header.expected_date ?? ""
  );
  const [reference, setReference] = useState(init?.header.reference ?? "");
  const [shipTo, setShipTo] = useState(init?.header.ship_to ?? "");
  const [notes, setNotes] = useState(init?.header.notes ?? "");
  const [lines, setLines] = useState<LineDraft[]>(() =>
    init && init.lines.length > 0
      ? init.lines.map((l) => {
          keySeq += 1;
          return {
            key: `l${keySeq}`,
            product_id: l.product_id,
            description: l.description ?? "",
            quantity: l.quantity,
            unit_cost: Number(l.unit_cost),
          };
        })
      : [newLine()]
  );
  const [saving, setSaving] = useState(false);

  const productById = useMemo(
    () => new Map(productOptions.map((p) => [p.id, p])),
    [productOptions]
  );
  // CAT-3b: category / sub-category filter for the line product pickers.
  const [poFilter, setPoFilter] = useState<CatFilterValue>({
    category: "",
    subcategory: "",
  });

  const total = useMemo(
    () => lines.reduce((s, l) => s + l.quantity * l.unit_cost, 0),
    [lines]
  );

  const patchLine = (key: string, patch: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const onPickProduct = (key: string, productId: string) => {
    const p = productById.get(productId);
    setLines((ls) =>
      ls.map((l) =>
        l.key === key
          ? {
              ...l,
              product_id: productId,
              // Prefill description + unit_cost only when the user hasn't typed
              // their own; never clobber an edited value.
              description: l.description.trim() === "" ? p?.name ?? "" : l.description,
              unit_cost: l.unit_cost === 0 ? p?.cost ?? 0 : l.unit_cost,
            }
          : l
      )
    );
  };

  const [confirm, setConfirm] = useState<
    | null
    | { title: string; body: string; cta: string; run: () => Promise<void> }
  >(null);
  const [working, setWorking] = useState(false);

  // Persist the form (create or update). Returns the PO id on success so the
  // caller can chain a transition (e.g. Issue = save-then-issue).
  const persist = async (): Promise<{ ok: boolean; id?: string }> => {
    if (vendorId.trim() === "") {
      toast.error("A vendor is required.");
      return { ok: false };
    }
    const cleaned = lines.filter(
      (l) => l.product_id || l.description.trim() !== ""
    );
    if (cleaned.length === 0) {
      toast.error("Add at least one line.");
      return { ok: false };
    }
    setSaving(true);
    const payload = {
      header: {
        vendor_id: vendorId,
        order_date: orderDate || null,
        expected_date: expectedDate || null,
        reference: reference || null,
        ship_to: shipTo || null,
        notes: notes || null,
      },
      lines: cleaned.map((l, i) => ({
        product_id: l.product_id,
        description: l.description.trim() || null,
        quantity: l.quantity,
        unit_cost: l.unit_cost,
        line_no: i + 1,
      })),
    };
    const res = isEdit
      ? await updatePurchaseOrderAction(mode.detail.header.id, payload)
      : await createPurchaseOrderAction(payload);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return { ok: false };
    }
    return { ok: true, id: isEdit ? mode.detail.header.id : res.data.id };
  };

  const handleSave = async () => {
    const r = await persist();
    if (r.ok) {
      toast.success(isEdit ? "Purchase order updated" : "Purchase order created");
      onSaved();
      onClose();
    }
  };

  // Issue (draft only) = persist the current edits, then transition to 'issued'.
  const handleIssue = async () => {
    const r = await persist();
    if (!r.ok || !r.id) return;
    setWorking(true);
    const res = await issuePurchaseOrderAction(r.id);
    setWorking(false);
    if (res.ok) {
      toast.success("Purchase order issued");
      onSaved();
      onClose();
    } else {
      toast.error(res.error);
    }
  };

  // Run a status transition on the persisted PO (cancel / close / reopen).
  const runTransition = (
    fn: (id: string) => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>,
    successMsg: string
  ) => {
    if (mode.kind !== "edit") return;
    const id = mode.detail.header.id;
    setWorking(true);
    fn(id).then((res) => {
      setWorking(false);
      if (res.ok) {
        toast.success(successMsg);
        onSaved();
        onClose();
      } else {
        toast.error(res.error);
      }
    });
  };

  const busy = saving || working;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <SheetContent side="right" className="w-[560px] overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 font-serif text-2xl">
            {isEdit ? mode.detail.header.po_number : "New purchase order"}
            {isEdit && <StatusBadge status={status} />}
          </SheetTitle>
          <SheetDescription>
            {!isEdit
              ? "Raise a draft purchase order against a vendor."
              : editable
                ? "Draft — editable. Changes save immediately."
                : "Read-only. Use the actions below to advance this order."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4 px-4 pb-8">
          {editable && (
          <>
          {/* Header */}
          <div className="space-y-1">
            <Label className="text-xs">
              Vendor<span className="text-red-600"> *</span>
            </Label>
            <Select value={vendorId} onValueChange={(v) => setVendorId(v ?? "")}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select vendor…" />
              </SelectTrigger>
              <SelectContent>
                {vendorOptions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Order date</Label>
              <Input
                type="date"
                value={orderDate ?? ""}
                onChange={(e) => setOrderDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Expected date</Label>
              <Input
                type="date"
                value={expectedDate ?? ""}
                onChange={(e) => setExpectedDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Reference</Label>
            <Input
              value={reference ?? ""}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Internal reference / requisition #"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ship to</Label>
            <Input
              value={shipTo ?? ""}
              onChange={(e) => setShipTo(e.target.value)}
              placeholder="Warehouse / site address"
            />
          </div>

          {/* Line editor */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium uppercase tracking-wide">
                Lines
              </Label>
              <span className="text-muted-foreground text-[11px]">
                Total{" "}
                <span className="text-brand-navy font-medium">
                  {formatCurrency(total)}
                </span>
              </span>
            </div>

            {/* CAT-3b: narrow the part pickers below by category / sub-category. */}
            <CategorySubcategoryFilter value={poFilter} onChange={setPoFilter} />

            {lines.map((l) => {
              // Show filtered parts, but always keep this line's already-picked
              // part in its own list so the selected label still renders.
              const lineOptions = productOptions.filter(
                (p) => matchesCatFilter(p, poFilter) || p.id === l.product_id
              );
              return (
              <div
                key={l.key}
                className="bg-background space-y-1.5 rounded-md border border-[var(--border)] p-2"
              >
                <div className="flex items-center gap-1.5">
                  <Select
                    value={l.product_id ?? ""}
                    onValueChange={(v) => onPickProduct(l.key, v ?? "")}
                  >
                    <SelectTrigger className="h-7 flex-1 text-xs">
                      <SelectValue placeholder="Pick a part (optional)…" />
                    </SelectTrigger>
                    <SelectContent>
                      {lineOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.sku} — {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive h-7 w-7 p-0"
                    onClick={() =>
                      setLines((ls) =>
                        ls.length > 1
                          ? ls.filter((x) => x.key !== l.key)
                          : ls
                      )
                    }
                    aria-label="Remove line"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Input
                  value={l.description}
                  onChange={(e) => patchLine(l.key, { description: e.target.value })}
                  placeholder="Description (required if no part)"
                  className="h-7 text-xs"
                  aria-label="Line description"
                />
                <div className="grid grid-cols-3 gap-1.5">
                  <div>
                    <Label className="text-muted-foreground text-[10px]">Qty</Label>
                    <Input
                      type="number"
                      min={1}
                      step="1"
                      value={l.quantity}
                      onChange={(e) =>
                        patchLine(l.key, {
                          quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                        })
                      }
                      className="h-7 text-right text-xs"
                      aria-label="Quantity"
                    />
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-[10px]">
                      Unit cost
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={l.unit_cost}
                      onChange={(e) =>
                        patchLine(l.key, {
                          unit_cost: Math.max(0, parseFloat(e.target.value) || 0),
                        })
                      }
                      className="h-7 text-right text-xs"
                      aria-label="Unit cost"
                    />
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-[10px]">
                      Line total
                    </Label>
                    <div className="text-brand-navy flex h-7 items-center justify-end text-xs font-medium">
                      {formatCurrency(l.quantity * l.unit_cost)}
                    </div>
                  </div>
                </div>
              </div>
              );
            })}

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setLines((ls) => [...ls, newLine()])}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add line
            </Button>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={notes ?? ""}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          </>
          )}

          {/* Read-only detail (any non-draft PO) */}
          {!editable && init && !receiving && <ReadOnlyDetail detail={init} />}

          {/* Receive panel (issued / partially_received) */}
          {!editable && init && receiving && (
            <ReceivePanel
              detail={init}
              locationOptions={locationOptions}
              onCancel={() => setReceiving(false)}
              onDone={() => {
                onSaved();
                onClose();
              }}
            />
          )}

          {/* ─── Footer / actions ─────────────────────────────────────── */}
          {!receiving && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Close
            </Button>

            {editable && (
              <Button type="button" onClick={handleSave} disabled={busy}>
                {saving ? "Saving…" : isEdit ? "Save draft" : "Create draft"}
              </Button>
            )}

            {/* Receive (issued / partially_received) */}
            {isEdit && canReceive(status) && (
              <Button type="button" onClick={() => setReceiving(true)} disabled={busy}>
                Receive
              </Button>
            )}

            {/* Issue (draft, edit mode only — needs a persisted PO) */}
            {isEdit && canIssue(status) && (
              <Button type="button" onClick={handleIssue} disabled={busy}>
                {working ? "Issuing…" : "Issue"}
              </Button>
            )}

            {/* Admin reopen (issued → draft) */}
            {isEdit && isAdmin && canReopen(status) && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  setConfirm({
                    title: "Reopen to draft?",
                    body: "This moves the issued PO back to Draft so it can be edited again.",
                    cta: "Reopen",
                    run: async () =>
                      runTransition(reopenPurchaseOrderAction, "Purchase order reopened"),
                  })
                }
              >
                Reopen
              </Button>
            )}

            {/* Close (issued / partially_received / received) */}
            {isEdit && canClose(status) && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  setConfirm({
                    title: "Close purchase order?",
                    body: "Closing marks the PO complete. This is terminal — it can't be reopened.",
                    cta: "Close PO",
                    run: async () =>
                      runTransition(closePurchaseOrderAction, "Purchase order closed"),
                  })
                }
              >
                Close
              </Button>
            )}

            {/* Cancel PO (draft / issued / partially_received) */}
            {isEdit && canCancel(status) && (
              <Button
                type="button"
                disabled={busy}
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={() =>
                  setConfirm({
                    title: "Cancel purchase order?",
                    body: `${mode.detail.header.po_number} will be marked cancelled. This is terminal.`,
                    cta: "Cancel PO",
                    run: async () =>
                      runTransition(cancelPurchaseOrderAction, "Purchase order cancelled"),
                  })
                }
              >
                Cancel PO
              </Button>
            )}
          </div>
          )}
        </div>
      </SheetContent>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && !working && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">{confirm?.title}</DialogTitle>
            <DialogDescription>{confirm?.body}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setConfirm(null)}
              disabled={working}
              className="text-muted-foreground hover:bg-muted rounded-md px-3 py-2 text-xs font-medium disabled:opacity-60"
            >
              Back
            </button>
            <button
              type="button"
              disabled={working}
              onClick={() => {
                const c = confirm;
                if (!c) return;
                setConfirm(null);
                void c.run();
              }}
              className="rounded-md bg-brand-navy px-4 py-2 text-xs font-semibold tracking-wide text-white shadow-sm disabled:opacity-60"
            >
              {confirm?.cta}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}

// Read-only rendering of a non-draft PO: header facts + a lines table with a
// per-line received/ordered indicator (ready for PO-4) and the running total.
function ReadOnlyDetail({ detail }: { detail: PurchaseOrderDetail }) {
  const { header, lines } = detail;
  const total = lines.reduce(
    (s, l) => s + Number(l.quantity) * Number(l.unit_cost),
    0
  );
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <Fact label="Vendor" value={header.vendor_name} />
        <Fact label="Order date" value={header.order_date ?? "—"} />
        <Fact label="Expected" value={header.expected_date ?? "—"} />
        <Fact label="Reference" value={header.reference ?? "—"} />
        <Fact label="Ship to" value={header.ship_to ?? "—"} />
      </dl>

      <div>
        <div className="text-muted-foreground mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide">
          <span>Lines</span>
          <span>
            Total{" "}
            <span className="text-brand-navy font-medium">
              {formatCurrency(total)}
            </span>
          </span>
        </div>
        <ul className="space-y-1.5">
          {lines.map((l) => (
            <li
              key={l.id}
              className="rounded-md border border-[var(--border)] bg-background p-2 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {l.product_sku ? (
                    <span className="text-muted-foreground">{l.product_sku} · </span>
                  ) : null}
                  {l.product_name ?? l.description ?? "—"}
                </span>
                <span className="text-brand-navy font-medium">
                  {formatCurrency(Number(l.quantity) * Number(l.unit_cost))}
                </span>
              </div>
              <div className="text-muted-foreground mt-0.5 flex items-center gap-3 text-[11px]">
                <span>Qty {l.quantity}</span>
                <span>@ {formatCurrency(Number(l.unit_cost))}</span>
                <span>
                  Received {l.received_qty} / {l.quantity}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {header.notes ? (
        <div>
          <div className="text-muted-foreground mb-1 text-[11px] uppercase tracking-wide">
            Notes
          </div>
          <p className="text-xs leading-relaxed">{header.notes}</p>
        </div>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-[10px] uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-brand-charcoal">{value}</dd>
    </div>
  );
}
