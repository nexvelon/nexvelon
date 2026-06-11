"use client";

// INV-2b — shared product catalog form body. Mirrors the ClientForm pattern:
// one component drives BOTH create mode (/inventory/new) and edit mode (the
// detail page), discriminated by the `mode` prop. handleSubmit signals
// completion via onSubmitSuccess(productId) so the wrapper can navigate.
//
// category / manufacturer / vendor are free-text in the DB (operator-
// extensible, §2.1) — rendered as <input list> + <datalist> so the UI-union
// values are offered as suggestions without constraining entry.

import { useEffect, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  listInventoryVocabAction,
  listSubcategoriesAction,
} from "@/app/(app)/settings/inventory-vocab-actions";
import type { DbInventoryVocab } from "@/lib/api/inventory-vocab";
import { ProductImageField } from "./ProductImageField";
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
  listProductsAction,
  updateProductAction,
} from "@/app/(app)/inventory/actions";
import type {
  AddonEntry,
  DbInventoryProduct,
  DbInventoryProductInsert,
  InventoryTrackingMode,
} from "@/lib/types/database";
import type { Product } from "@/lib/types";

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
export const VENDOR_OPTIONS = ["ADI", "Anixter", "Wesco", "CDW", "Provo"];
// B-2: fallback unit list (the only kind without a prior hardcoded const) used
// if the managed inventory_vocab fetch is empty/unavailable.
const UNIT_FALLBACK = ["Each", "Box", "Pack", "Case", "Roll", "Feet", "Meter"];

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
  // CAT-3: sub-category (dependent on category). Stored as a name like category.
  const [subcategory, setSubcategory] = useState(existing?.subcategory ?? "");
  const [manufacturer, setManufacturer] = useState(existing?.manufacturer ?? "");
  const [vendor, setVendor] = useState(existing?.vendor ?? "");
  // CAT-1: part-number identifiers (migration 0032).
  const [upc, setUpc] = useState(existing?.upc ?? "");
  const [masterPartNumber, setMasterPartNumber] = useState(
    existing?.master_part_number ?? ""
  );
  const [replacementPartNumber, setReplacementPartNumber] = useState(
    existing?.replacement_part_number ?? ""
  );
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
  // C-5: reorder_qty field removed from the UI. The DB column stays (vestigial)
  // per past-data preservation — we simply no longer send or show it.

  // C-1: alternate search terms (stored as text[]). Add one at a time; chips
  // are removable. Trimmed, deduped (case-insensitive), empties ignored.
  const [searchAliases, setSearchAliases] = useState<string[]>(
    existing?.search_aliases ?? []
  );
  const [aliasInput, setAliasInput] = useState("");

  const addAlias = () => {
    const a = aliasInput.trim();
    if (a === "") return;
    const exists = searchAliases.some((x) => x.toLowerCase() === a.toLowerCase());
    if (!exists) setSearchAliases((prev) => [...prev, a]);
    setAliasInput("");
  };
  const removeAlias = (a: string) =>
    setSearchAliases((prev) => prev.filter((x) => x !== a));

  // D-1: companion add-ons. notifyAddons toggles the quote-builder prompt
  // (wired in D-2); addons is an ordered mixed list of part-refs + text notes.
  const [notifyAddons, setNotifyAddons] = useState(
    existing?.notify_addons ?? false
  );
  const [addons, setAddons] = useState<AddonEntry[]>(existing?.addons ?? []);
  const [addonKind, setAddonKind] = useState<"part" | "text">("part");
  const [addonText, setAddonText] = useState("");
  const [addonPartQuery, setAddonPartQuery] = useState("");

  // Catalog for the Part # add-on picker. Fetched here (NOT via the quote
  // builder's context) so ProductForm stays decoupled; degrades to text-only
  // entries if the fetch fails.
  const [catalog, setCatalog] = useState<Product[]>([]);
  useEffect(() => {
    let live = true;
    listProductsAction()
      .then((rows) => {
        if (live) setCatalog(rows);
      })
      .catch(() => {
        // part picker degrades gracefully; text add-ons still work
      });
    return () => {
      live = false;
    };
  }, []);

  const addPartAddon = (productId: string) => {
    const already = addons.some(
      (e) => e.kind === "part" && e.value === productId
    );
    if (already) return;
    setAddons((prev) => [...prev, { kind: "part", value: productId }]);
    setAddonPartQuery("");
  };
  const addTextAddon = () => {
    const t = addonText.trim();
    if (t === "") return;
    setAddons((prev) => [...prev, { kind: "text", value: t }]);
    setAddonText("");
  };
  const removeAddon = (idx: number) =>
    setAddons((prev) => prev.filter((_, i) => i !== idx));

  // Resolve a part add-on id to a "sku — name" label (skip-if-deleted).
  const partLabel = (productId: string): string => {
    const p = catalog.find((x) => x.id === productId);
    return p ? `${p.sku} — ${p.name}` : "(deleted part)";
  };

  // Catalog matches for the picker: exclude self + already-added parts.
  const addonPartMatches = (() => {
    const q = addonPartQuery.trim().toLowerCase();
    if (q === "") return [];
    const editingId = existing?.id;
    const chosen = new Set(
      addons.filter((e) => e.kind === "part").map((e) => e.value)
    );
    return catalog
      .filter(
        (p) =>
          p.id !== editingId &&
          !chosen.has(p.id) &&
          (p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      )
      .slice(0, 8);
  })();

  // B-2: datalist suggestions sourced from the managed inventory_vocab lists.
  // Default to the hardcoded consts so the form works before the fetch resolves
  // (and as a fallback if the fetch fails or a list is empty / 0023 not applied).
  const [categoryOptions, setCategoryOptions] = useState<string[]>(CATEGORY_OPTIONS);
  const [manufacturerOptions, setManufacturerOptions] =
    useState<string[]>(MANUFACTURER_OPTIONS);
  const [unitOptions, setUnitOptions] = useState<string[]>(UNIT_FALLBACK);
  // CAT-3: category rows (with ids) + active subcategories, for the dependent
  // sub-category select.
  const [categoryRows, setCategoryRows] = useState<DbInventoryVocab[]>([]);
  const [subcatRows, setSubcatRows] = useState<DbInventoryVocab[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([
      listInventoryVocabAction("category"),
      listInventoryVocabAction("manufacturer"),
      listInventoryVocabAction("unit_of_measure"),
      listSubcategoriesAction(),
    ])
      .then(([cat, man, uom, sub]) => {
        if (!active) return;
        if (cat.ok) {
          setCategoryRows(cat.data);
          if (cat.data.length) setCategoryOptions(cat.data.map((r) => r.name));
        }
        if (man.ok && man.data.length)
          setManufacturerOptions(man.data.map((r) => r.name));
        if (uom.ok && uom.data.length) setUnitOptions(uom.data.map((r) => r.name));
        if (sub.ok) setSubcatRows(sub.data);
      })
      .catch(() => {
        // keep the hardcoded fallbacks
      });
    return () => {
      active = false;
    };
  }, []);

  // Sub-categories available for the currently-selected category (by name → id).
  const selectedCategoryId = categoryRows.find((c) => c.name === category)?.id;
  const availableSubcategories = subcatRows.filter(
    (s) => s.parent_id === selectedCategoryId
  );

  // Reset the sub-category when the category changes and the current value no
  // longer belongs to it (keeps an unrelated subcategory from sticking). Guarded
  // until the vocab fetch resolves so an existing product's saved value isn't
  // cleared before its parent category has loaded.
  useEffect(() => {
    if (categoryRows.length === 0) return; // not loaded yet
    if (
      subcategory !== "" &&
      !availableSubcategories.some((s) => s.name === subcategory)
    ) {
      setSubcategory("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, subcatRows, categoryRows]);

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
      toast.error("Part # is required.");
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
      subcategory: subcategory.trim() || null,
      manufacturer: manufacturer.trim() || null,
      vendor: vendor.trim() || null,
      tracking_mode: trackingMode,
      unit_of_measure: unitOfMeasure.trim() || "each",
      default_unit_cost: numOrNull(defaultUnitCost),
      list_price: numOrNull(listPrice),
      reorder_point: numOrNull(reorderPoint),
      search_aliases: searchAliases,
      notify_addons: notifyAddons,
      addons,
      upc: upc.trim() || null,
      master_part_number: masterPartNumber.trim() || null,
      replacement_part_number: replacementPartNumber.trim() || null,
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
          <Field label="Part #" required>
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
        {/* IMG-1: image upload (edit mode; create mode shows a save-first hint) */}
        <ProductImageField
          productId={existing?.id ?? null}
          initialImagePath={existing?.image_path ?? null}
        />
      </section>

      {/* Part identifiers — CAT-1 (migration 0032) */}
      <section className="space-y-4">
        <h2 className="text-brand-navy text-sm font-semibold tracking-wide uppercase">
          Part Identifiers
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="UPC / Barcode">
            <Input
              id="product-upc"
              value={upc}
              onChange={(e) => setUpc(e.target.value)}
              placeholder="Scan or type…"
            />
            <p className="text-muted-foreground text-[11px]">
              Click here and scan with a USB/Bluetooth barcode scanner, or type
              it.
            </p>
          </Field>
          <Field label="Master Part #">
            <Input
              value={masterPartNumber}
              onChange={(e) => setMasterPartNumber(e.target.value)}
              placeholder="e.g. NX-1024"
            />
            <p className="text-muted-foreground text-[11px]">
              Our own part number — can be shown on customer quotes.
            </p>
          </Field>
          <Field label="Replacement Part #">
            <Input
              value={replacementPartNumber}
              onChange={(e) => setReplacementPartNumber(e.target.value)}
              placeholder="Alternate part #"
            />
            <p className="text-muted-foreground text-[11px]">
              An alternate part to order if this one is unavailable.
            </p>
          </Field>
        </div>
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
              {categoryOptions.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </Field>
          {/* CAT-3: dependent sub-category select (options scoped to the chosen
              category; disabled until a category with sub-categories is picked). */}
          <Field label="Sub-category">
            <select
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              disabled={!selectedCategoryId || availableSubcategories.length === 0}
              className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">
                {!selectedCategoryId
                  ? "Choose a category first"
                  : availableSubcategories.length === 0
                    ? "No sub-categories"
                    : "None"}
              </option>
              {availableSubcategories.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Manufacturer">
            <Input
              list="product-manufacturer-options"
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              placeholder="Select or type…"
            />
            <datalist id="product-manufacturer-options">
              {manufacturerOptions.map((o) => (
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
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="serialized">Serialized</SelectItem>
                <SelectItem value="non_serialized">Non-serialized</SelectItem>
                <SelectItem value="bulk">Bulk</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-[11px] leading-snug">
              Serialized = each unit has a serial. Non-serialized = countable
              items, no serial. Bulk = a measured quantity (e.g. cable by the
              foot).
            </p>
          </Field>
          <Field label="Unit of measure">
            <Input
              list="product-unit-options"
              value={unitOfMeasure}
              onChange={(e) => setUnitOfMeasure(e.target.value)}
              placeholder="each"
            />
            <datalist id="product-unit-options">
              {unitOptions.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
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
          <Field label="Low-stock at (qty)">
            <Input
              type="number"
              step="1"
              min="0"
              value={reorderPoint}
              onChange={(e) => setReorderPoint(e.target.value)}
              placeholder="0"
            />
            <p className="text-muted-foreground text-[11px] leading-snug">
              Flag this part as low stock when on-hand falls to or below this
              quantity. Leave blank/0 for no alert.
            </p>
          </Field>
        </div>
      </section>

      {/* Search aliases */}
      <section className="space-y-4">
        <h2 className="text-brand-navy text-sm font-semibold tracking-wide uppercase">
          Search aliases
        </h2>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={aliasInput}
              onChange={(e) => setAliasInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addAlias();
                }
              }}
              placeholder="Old part number, nickname, common misspelling…"
              className="max-w-md"
            />
            <Button
              type="button"
              variant="outline"
              onClick={addAlias}
              disabled={aliasInput.trim() === ""}
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
          {searchAliases.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {searchAliases.map((a) => (
                <li
                  key={a}
                  className="bg-muted/60 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs"
                >
                  <span className="text-brand-charcoal">{a}</span>
                  <button
                    type="button"
                    onClick={() => removeAlias(a)}
                    className="text-muted-foreground hover:text-red-600"
                    aria-label={`Remove ${a}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground text-[11px] leading-snug">
            Add alternate terms to find this part — old part numbers, nicknames,
            common misspellings.
          </p>
        </div>
      </section>

      {/* Add-ons (D-1) */}
      <section className="space-y-4">
        <h2 className="text-brand-navy text-sm font-semibold tracking-wide uppercase">
          Add-ons
        </h2>

        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={notifyAddons}
            onChange={(e) => setNotifyAddons(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-sm">
            Notify add-ons
            <span className="text-muted-foreground block text-[11px] leading-snug">
              When this part is added to a quote, prompt to also add these
              companion items.
            </span>
          </span>
        </label>

        <div className="space-y-2">
          {/* Entry-type selector */}
          <div className="flex items-center gap-2">
            <Select
              value={addonKind}
              onValueChange={(v) => setAddonKind((v ?? "part") as "part" | "text")}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="part">Part #</SelectItem>
                <SelectItem value="text">Text</SelectItem>
              </SelectContent>
            </Select>

            {addonKind === "text" ? (
              <>
                <Input
                  value={addonText}
                  onChange={(e) => setAddonText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTextAddon();
                    }
                  }}
                  placeholder="e.g. Don't forget mounting bracket"
                  className="max-w-md"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addTextAddon}
                  disabled={addonText.trim() === ""}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              </>
            ) : (
              <div className="relative max-w-md flex-1">
                <Input
                  value={addonPartQuery}
                  onChange={(e) => setAddonPartQuery(e.target.value)}
                  placeholder="Search a part by Part # or name…"
                />
                {addonPartMatches.length > 0 && (
                  <ul className="bg-card absolute z-10 mt-1 w-full overflow-hidden rounded-md border shadow-md">
                    {addonPartMatches.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => addPartAddon(p.id)}
                          className="hover:bg-muted/60 flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs"
                        >
                          <span className="text-brand-navy font-mono font-semibold">
                            {p.sku}
                          </span>
                          <span className="text-muted-foreground truncate">
                            {p.name}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {addons.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {addons.map((entry, idx) => (
                <li
                  key={`${entry.kind}-${entry.value}-${idx}`}
                  className="bg-muted/60 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs"
                >
                  <span className="text-muted-foreground text-[10px] uppercase">
                    {entry.kind === "part" ? "Part" : "Note"}
                  </span>
                  <span className="text-brand-charcoal">
                    {entry.kind === "part" ? partLabel(entry.value) : entry.value}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAddon(idx)}
                    className="text-muted-foreground hover:text-red-600"
                    aria-label="Remove add-on"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
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
