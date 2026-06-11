"use client";

// PO-2 — create/edit drawer for a DRAFT purchase order. Header fields + a line
// editor (add/remove rows; optional product picker prefills description +
// unit_cost; free-text description allowed) with a running total. Status stays
// 'draft' — the workflow lands in PO-3.

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
import {
  createPurchaseOrderAction,
  updatePurchaseOrderAction,
} from "@/app/(app)/purchase-orders/actions";
import type { PurchaseOrderDetail } from "@/lib/api/purchase-orders";

export interface VendorOption {
  id: string;
  name: string;
}
export interface ProductOption {
  id: string;
  sku: string;
  name: string;
  cost: number;
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
}: Props) {
  const isEdit = mode.kind === "edit";
  const init = mode.kind === "edit" ? mode.detail : null;

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

  const handleSave = async () => {
    if (vendorId.trim() === "") {
      toast.error("A vendor is required.");
      return;
    }
    const cleaned = lines.filter(
      (l) => l.product_id || l.description.trim() !== ""
    );
    if (cleaned.length === 0) {
      toast.error("Add at least one line.");
      return;
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
    if (res.ok) {
      toast.success(isEdit ? "Purchase order updated" : "Purchase order created");
      onSaved();
      onClose();
    } else {
      toast.error(res.error);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <SheetContent side="right" className="w-[560px] overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="font-serif text-2xl">
            {isEdit ? `Edit ${mode.detail.header.po_number}` : "New purchase order"}
          </SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update this draft purchase order. Changes save immediately."
              : "Raise a draft purchase order against a vendor."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4 px-4 pb-8">
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

            {lines.map((l) => (
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
                      {productOptions.map((p) => (
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
            ))}

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

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save draft" : "Create draft"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
