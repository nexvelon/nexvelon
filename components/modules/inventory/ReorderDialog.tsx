"use client";

// REORDER-1 — single confirm dialog behind the Reorder action. Prefilled but
// editable: vendor (filtered by excluded_parts; prefilled from the part's last
// PO vendor), order qty, unit cost, delivery warehouse, receive-by, note. A
// live free-shipping-gap line reads the chosen vendor's min_order_amount.
// Confirm creates a DRAFT PO (no email) and navigates into it.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { listVendorsAction } from "@/app/(app)/vendors/actions";
import { listStockLocationsAction } from "@/app/(app)/settings/stock-locations-actions";
import {
  createPurchaseOrderAction,
  getLastVendorIdForProductAction,
} from "@/app/(app)/purchase-orders/actions";
import type { DbVendor, DbStockLocation } from "@/lib/types/database";

export interface ReorderPart {
  id: string;
  sku: string;
  name: string;
  masterPartNumber?: string | null;
  onHand: number;
  reorderPoint: number;
  suggestedQty: number;
  defaultCost: number;
}

// A vendor that lists this part in excluded_parts (by SKU or master part #) is
// ineligible.
function vendorCarries(v: DbVendor, part: ReorderPart): boolean {
  const excluded = (v.excluded_parts ?? []).map((s) => s.trim().toLowerCase());
  if (excluded.length === 0) return true;
  const ids = [part.sku, part.masterPartNumber]
    .filter((s): s is string => !!s)
    .map((s) => s.trim().toLowerCase());
  return !ids.some((id) => excluded.includes(id));
}

export function ReorderDialog({
  part,
  open,
  onOpenChange,
}: {
  part: ReorderPart | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  const [vendors, setVendors] = useState<DbVendor[]>([]);
  const [warehouses, setWarehouses] = useState<DbStockLocation[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [vendorId, setVendorId] = useState("");
  const [qty, setQty] = useState("1");
  const [unitCost, setUnitCost] = useState("0");
  const [warehouseId, setWarehouseId] = useState("");
  const [receiveBy, setReceiveBy] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const eligibleVendors = useMemo(
    () =>
      part ? vendors.filter((v) => v.is_active && vendorCarries(v, part)) : [],
    [vendors, part]
  );

  // Load vendors + warehouses + last-PO vendor, then prefill, when (re)opened.
  useEffect(() => {
    if (!open || !part) return;
    setLoaded(false);
    setQty(String(part.suggestedQty > 0 ? part.suggestedQty : 1));
    setUnitCost(String(part.defaultCost ?? 0));
    setReceiveBy("");
    setNote("");
    let active = true;
    Promise.all([
      listVendorsAction(),
      listStockLocationsAction(),
      getLastVendorIdForProductAction(part.id),
    ])
      .then(([vRes, lRes, lastVendorId]) => {
        if (!active) return;
        const vendorList = vRes.ok ? vRes.data : [];
        const whs = (lRes.ok ? lRes.data : []).filter(
          (l) => l.location_type === "warehouse" && l.is_active
        );
        setVendors(vendorList);
        setWarehouses(whs);

        const eligible = vendorList.filter(
          (v) => v.is_active && vendorCarries(v, part)
        );
        const prefV =
          (lastVendorId && eligible.some((v) => v.id === lastVendorId)
            ? lastVendorId
            : eligible[0]?.id) ?? "";
        setVendorId(prefV);
        setWarehouseId(whs[0]?.id ?? "");
        setLoaded(true);
      })
      .catch(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [open, part]);

  const qtyNum = Number(qty);
  const costNum = Number(unitCost);
  const subtotal =
    Number.isFinite(qtyNum) && Number.isFinite(costNum)
      ? Math.max(qtyNum, 0) * Math.max(costNum, 0)
      : 0;

  const selectedVendor = eligibleVendors.find((v) => v.id === vendorId) ?? null;
  const minOrder = Number(selectedVendor?.min_order_amount ?? 0);

  // LIVE free-shipping gap line. Shown only when the vendor has a positive min.
  const shippingGap =
    minOrder > 0
      ? subtotal >= minOrder
        ? { qualified: true as const, remaining: 0 }
        : { qualified: false as const, remaining: minOrder - subtotal }
      : null;

  const qtyValid = Number.isInteger(qtyNum) && qtyNum >= 1;
  const costValid = Number.isFinite(costNum) && costNum >= 0;
  const canConfirm =
    !!part &&
    vendorId !== "" &&
    warehouseId !== "" &&
    qtyValid &&
    costValid &&
    !submitting;

  async function handleConfirm() {
    if (!part || !canConfirm) return;
    const warehouse = warehouses.find((w) => w.id === warehouseId);
    setSubmitting(true);
    const res = await createPurchaseOrderAction({
      header: {
        vendor_id: vendorId,
        status: "draft",
        expected_date: receiveBy || null,
        // No location FK on the PO — store the warehouse name as ship-to.
        ship_to: warehouse?.name ?? null,
        notes: note.trim() || null,
      },
      lines: [
        {
          product_id: part.id,
          description: `${part.sku} · ${part.name}`,
          quantity: qtyNum,
          unit_cost: costNum,
        },
      ],
    });
    if (!res.ok) {
      setSubmitting(false);
      toast.error(res.error);
      return;
    }
    toast.success("Draft PO created");
    onOpenChange(false);
    // Deep-link into the new draft (PurchaseOrdersView opens the drawer).
    router.push(`/purchase-orders?open=${res.data.id}`);
  }

  if (!part) return null;
  const noEligible = loaded && eligibleVendors.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reorder {part.sku}</DialogTitle>
          <DialogDescription>
            Creates a draft purchase order — review and issue it after. No email
            is sent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Part summary */}
          <div className="bg-muted/40 rounded-md border p-3 text-xs">
            <div className="text-brand-charcoal font-medium">{part.name}</div>
            <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-0.5 tabular-nums">
              <span>On hand: {part.onHand}</span>
              <span>Reorder point: {part.reorderPoint}</span>
              <span>Suggested: {part.suggestedQty}</span>
            </div>
          </div>

          {noEligible ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
              No eligible vendors carry this part (every vendor lists it in their
              excluded parts). Add a vendor or remove the exclusion, then retry.
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Vendor</Label>
                <Select value={vendorId} onValueChange={(v) => setVendorId(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a vendor…" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleVendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Order qty</Label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Unit cost</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Delivery location</Label>
                  <Select
                    value={warehouseId}
                    onValueChange={(v) => setWarehouseId(v ?? "")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Warehouse…" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Receive by (optional)</Label>
                  <Input
                    type="date"
                    value={receiveBy}
                    onChange={(e) => setReceiveBy(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Note (optional)</Label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Reference / instructions…"
                />
              </div>

              {/* Totals + live shipping-gap line */}
              <div className="space-y-1 border-t pt-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="text-brand-charcoal font-semibold tabular-nums">
                    {formatCurrency(subtotal)}
                  </span>
                </div>
                {shippingGap &&
                  (shippingGap.qualified ? (
                    <p className="text-[var(--brand-status-green)]">
                      Eligible for free shipping (vendor min{" "}
                      {formatCurrency(minOrder)}).
                    </p>
                  ) : (
                    <p className="text-amber-700">
                      Vendor min for free shipping: {formatCurrency(minOrder)}. Add{" "}
                      {formatCurrency(shippingGap.remaining)} more to qualify.
                    </p>
                  ))}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm || noEligible}
          >
            {submitting ? "Creating…" : "Create draft PO"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
