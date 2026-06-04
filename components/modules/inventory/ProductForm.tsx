"use client";

// INV-2b — shared product catalog form body. Mirrors the ClientForm pattern:
// one component drives BOTH create mode (/inventory/new) and edit mode (the
// detail page), discriminated by the `mode` prop. handleSubmit signals
// completion via onSubmitSuccess(productId) so the wrapper can navigate.
//
// category / manufacturer / vendor are free-text in the DB (operator-
// extensible, §2.1) — rendered as <input list> + <datalist> so the UI-union
// values are offered as suggestions without constraining entry.

import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import {
  createProductAction,
  updateProductAction,
} from "@/app/(app)/inventory/actions";
import type {
  DbInventoryProduct,
  DbInventoryProductInsert,
  InventoryTrackingMode,
} from "@/lib/types/database";

// Seed vocabularies for the free-text suggestion dropdowns. These mirror the
// lib/types.ts UI unions but are runtime arrays (the unions are type-only) and
// are intentionally NON-constraining — operators can type any value.
const CATEGORY_OPTIONS = [
  "Access Control",
  "CCTV",
  "Video Surveillance",
  "Intrusion",
  "Intercom",
  "Networking",
  "Network",
  "Power",
  "Cabling",
  "Racks",
  "Accessories",
];
const MANUFACTURER_OPTIONS = [
  "Kantech",
  "Genetec",
  "Avigilon",
  "DSC",
  "Hanwha",
  "ICT",
  "Hartmann",
  "Keyscan",
  "C-CURE",
  "Lenel",
  "Axis",
  "Uniview",
  "Vivotek",
];
const VENDOR_OPTIONS = ["ADI", "Anixter", "Wesco", "CDW", "Provo"];

export type Mode =
  | { kind: "create" }
  | { kind: "edit"; product: DbInventoryProduct };

interface ProductFormProps {
  mode: Mode;
  /** Fires after a successful create OR edit, with the product id. */
  onSubmitSuccess: (productId: string) => void;
  /** Fires when the user clicks Cancel. */
  onCancel: () => void;
}

export function ProductForm({ mode, onSubmitSuccess, onCancel }: ProductFormProps) {
  const isEdit = mode.kind === "edit";
  const existing = isEdit ? mode.product : null;

  const [sku, setSku] = useState(existing?.sku ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [category, setCategory] = useState(existing?.category ?? "");
  const [manufacturer, setManufacturer] = useState(existing?.manufacturer ?? "");
  const [vendor, setVendor] = useState(existing?.vendor ?? "");
  const [trackingMode, setTrackingMode] = useState<InventoryTrackingMode>(
    existing?.tracking_mode ?? "serialized"
  );
  const [unitOfMeasure, setUnitOfMeasure] = useState(
    existing?.unit_of_measure ?? "each"
  );
  const [defaultUnitCost, setDefaultUnitCost] = useState(
    existing?.default_unit_cost != null ? String(existing.default_unit_cost) : ""
  );
  const [listPrice, setListPrice] = useState(
    existing?.list_price != null ? String(existing.list_price) : ""
  );
  const [reorderPoint, setReorderPoint] = useState(
    existing?.reorder_point != null ? String(existing.reorder_point) : ""
  );
  const [reorderQty, setReorderQty] = useState(
    existing?.reorder_qty != null ? String(existing.reorder_qty) : ""
  );

  const [pending, startTransition] = useTransition();

  // Coerce a text field to a number-or-null payload value.
  const numOrNull = (s: string): number | null => {
    const t = s.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (sku.trim() === "") {
      toast.error("SKU is required.");
      return;
    }
    if (name.trim() === "") {
      toast.error("Name is required.");
      return;
    }

    const payload: DbInventoryProductInsert = {
      sku: sku.trim(),
      name: name.trim(),
      description: description.trim() || null,
      category: category.trim() || null,
      manufacturer: manufacturer.trim() || null,
      vendor: vendor.trim() || null,
      tracking_mode: trackingMode,
      unit_of_measure: unitOfMeasure.trim() || "each",
      default_unit_cost: numOrNull(defaultUnitCost),
      list_price: numOrNull(listPrice),
      reorder_point: numOrNull(reorderPoint),
      reorder_qty: numOrNull(reorderQty),
    };

    startTransition(async () => {
      const result =
        isEdit && existing
          ? await updateProductAction(existing.id, payload)
          : await createProductAction(payload);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(isEdit ? `Updated ${payload.name}` : `Added ${payload.name}`);
      onSubmitSuccess(result.data.id);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Identity */}
      <section className="space-y-4">
        <h2 className="text-brand-navy text-sm font-semibold tracking-wide uppercase">
          Product
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="SKU" required>
            <Input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="e.g. KT-300"
            />
          </Field>
          <Field label="Name" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Product name"
            />
          </Field>
        </div>
        <Field label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Optional description"
          />
        </Field>
      </section>

      {/* Classification — free-text with seeded suggestions */}
      <section className="space-y-4">
        <h2 className="text-brand-navy text-sm font-semibold tracking-wide uppercase">
          Classification
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Category">
            <Input
              list="product-category-options"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Select or type…"
            />
            <datalist id="product-category-options">
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </Field>
          <Field label="Manufacturer">
            <Input
              list="product-manufacturer-options"
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              placeholder="Select or type…"
            />
            <datalist id="product-manufacturer-options">
              {MANUFACTURER_OPTIONS.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </Field>
          <Field label="Vendor">
            <Input
              list="product-vendor-options"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="Select or type…"
            />
            <datalist id="product-vendor-options">
              {VENDOR_OPTIONS.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </Field>
        </div>
      </section>

      {/* Tracking & pricing */}
      <section className="space-y-4">
        <h2 className="text-brand-navy text-sm font-semibold tracking-wide uppercase">
          Tracking & Pricing
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Tracking mode">
            <Select
              value={trackingMode}
              onValueChange={(v) => setTrackingMode(v as InventoryTrackingMode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="serialized">
                  Serialized (one row per unit)
                </SelectItem>
                <SelectItem value="bulk">Bulk (lot quantity)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Unit of measure">
            <Input
              value={unitOfMeasure}
              onChange={(e) => setUnitOfMeasure(e.target.value)}
              placeholder="each"
            />
          </Field>
          <Field label="Default unit cost">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={defaultUnitCost}
              onChange={(e) => setDefaultUnitCost(e.target.value)}
              placeholder="0.00"
            />
          </Field>
          <Field label="List price">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={listPrice}
              onChange={(e) => setListPrice(e.target.value)}
              placeholder="0.00"
            />
          </Field>
          <Field label="Reorder point">
            <Input
              type="number"
              step="1"
              min="0"
              value={reorderPoint}
              onChange={(e) => setReorderPoint(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Reorder quantity">
            <Input
              type="number"
              step="1"
              min="0"
              value={reorderQty}
              onChange={(e) => setReorderQty(e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>
      </section>

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create product"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </Label>
      {children}
    </div>
  );
}
