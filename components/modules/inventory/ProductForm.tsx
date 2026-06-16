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
import { listManufacturersAction } from "@/app/(app)/settings/manufacturers-actions";
import { listVendorsAction } from "@/app/(app)/vendors/actions";
import { listMarginTiersAction } from "@/app/(app)/settings/margin-tiers-actions";
import { listCategoriesAction } from "@/app/(app)/settings/category-actions";
import type { DbMarginTier } from "@/lib/api/margin-tiers";
import type { DbInventoryCategory } from "@/lib/types/database";
import { ProductImageField } from "./ProductImageField";
import {
  PendingAttachments,
  type PendingAttachment,
} from "./PendingAttachments";
import {
  deleteProductImage,
  uploadProductImage,
} from "@/lib/api/product-images";
import {
  deleteAttachmentObject,
  uploadAttachmentObject,
} from "@/lib/api/attachments";
import { createAttachment } from "@/app/(app)/attachments/actions";
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
import { isSerializedProduct } from "@/lib/inventory-serial";

// Seed vocabularies for the free-text suggestion dropdowns. These mirror the
// lib/types.ts UI unions but are runtime arrays (the unions are type-only) and
// are intentionally NON-constraining — operators can type any value.
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
// PART-FORM B1: standard unit-of-measure option set (a fixed Select, not the
// old type-to-clear combobox). "Each" is the default for new parts.
const UOM_OPTIONS = [
  "Each",
  "Box",
  "Case",
  "Pack",
  "Roll",
  "Foot",
  "Meter",
  "Bag",
  "Spool",
  "Kit",
];
// PART-FORM B1: sentinel for the nullable vendor/manufacturer Selects (Radix
// Select disallows an empty-string item value). Mirrors LineItemRow's pattern.
const NONE = "__none__";
// PART-FORM B1: ensure a part's current stored value is always an option, so
// editing never silently drops a value that isn't in the managed list.
function withCurrent(options: string[], current: string): string[] {
  const c = current.trim();
  return c !== "" && !options.includes(c) ? [c, ...options] : options;
}

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
  // PART-FORM B1: free-text part notes (form bottom).
  const [notes, setNotes] = useState(existing?.notes ?? "");
  // PART-FIX-2: legacy free-text category/subcategory are PRESERVED (not edited
  // here anymore) — kept in state so an edit re-saves them unchanged.
  const [category] = useState(existing?.category ?? "");
  const [subcategory] = useState(existing?.subcategory ?? "");
  // The hierarchical category leaf (category_id). Empty for legacy parts.
  const [categoryId, setCategoryId] = useState<string | null>(
    existing?.category_id ?? null
  );
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
  // SERIAL-1: the serialized toggle is the authoritative control; it drives
  // tracking_mode on save. Initialize on from either signal (legacy parts may
  // carry tracking_mode='serialized' without is_serialized set). New parts off.
  const [isSerialized, setIsSerialized] = useState<boolean>(
    existing ? isSerializedProduct(existing) : false
  );
  const [unitOfMeasure, setUnitOfMeasure] = useState(
    existing?.unit_of_measure ?? "Each"
  );
  // PART-FIX-1: pack-size + sub-allocate. Shown only when UoM isn't "Each".
  const [packSize, setPackSize] = useState(
    existing?.pack_size != null ? String(existing.pack_size) : ""
  );
  const [trackIndividual, setTrackIndividual] = useState<boolean>(
    existing?.track_individual_units ?? false
  );
  const [defaultUnitCost, setDefaultUnitCost] = useState(
    existing?.default_unit_cost != null ? String(existing.default_unit_cost) : ""
  );
  // PART-FORM-2: the "Fixed price" input (still stored in list_price).
  const [listPrice, setListPrice] = useState(
    existing?.list_price != null ? String(existing.list_price) : ""
  );
  const [reorderPoint, setReorderPoint] = useState(
    existing?.reorder_point != null ? String(existing.reorder_point) : ""
  );
  // PART-FORM-2: reorder_qty re-added to the UI (was dropped in C-5).
  const [reorderQty, setReorderQty] = useState(
    existing?.reorder_qty != null ? String(existing.reorder_qty) : ""
  );
  // PART-FORM-2: MSRP (reference only).
  const [msrp, setMsrp] = useState(
    existing?.msrp != null ? String(existing.msrp) : ""
  );
  // PART-FORM-2: quote-default chooser. Mode is derived from existing data so
  // parts with a list_price or tier load into the right mode (no data dropped).
  const [quoteMode, setQuoteMode] = useState<"tier" | "fixed" | "none">(
    existing?.margin_tier_id
      ? "tier"
      : existing?.list_price != null
        ? "fixed"
        : "none"
  );
  const [marginTierId, setMarginTierId] = useState(
    existing?.margin_tier_id ?? ""
  );
  const [marginTiers, setMarginTiers] = useState<DbMarginTier[]>([]);
  useEffect(() => {
    let active = true;
    listMarginTiersAction()
      .then((res) => {
        if (active && res.ok) setMarginTiers(res.data);
      })
      .catch(() => {
        /* tier picker just stays empty */
      });
    return () => {
      active = false;
    };
  }, []);

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
  // PART-FORM B1: Manufacturer now sources from the managed manufacturers table;
  // Vendor from the vendors list. Both fall back to the hardcoded consts until
  // the fetch resolves (or if empty/unavailable). UoM uses the fixed UOM_OPTIONS.
  const [manufacturerOptions, setManufacturerOptions] =
    useState<string[]>(MANUFACTURER_OPTIONS);
  const [vendorOptions, setVendorOptions] = useState<string[]>(VENDOR_OPTIONS);
  // PART-FIX-2: the full category tree for the cascading selector.
  const [categories, setCategories] = useState<DbInventoryCategory[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([
      listManufacturersAction(),
      listVendorsAction(),
      listCategoriesAction(),
    ])
      .then(([man, ven, cat]) => {
        if (!active) return;
        if (man.ok && man.data.length)
          setManufacturerOptions(man.data.map((r) => r.name));
        if (ven.ok && ven.data.length)
          setVendorOptions(ven.data.map((v) => v.name));
        if (cat.ok) setCategories(cat.data);
      })
      .catch(() => {
        // keep the hardcoded fallbacks
      });
    return () => {
      active = false;
    };
  }, []);

  const [pending, startTransition] = useTransition();

  // PART-FIX-1: create-mode pending uploads (persisted after the part is made).
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);

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

    // PART-FIX-1: pack_size is required when UoM isn't "Each" (never silently
    // default to 1).
    const isPackUom =
      unitOfMeasure.trim() !== "" && unitOfMeasure.toLowerCase() !== "each";
    if (isPackUom && (numOrNull(packSize) == null || Number(packSize) <= 0)) {
      toast.error(`Units per ${unitOfMeasure.toLowerCase()} is required.`);
      return;
    }

    // SERIAL-1: the toggle drives tracking_mode. On → 'serialized'. Off →
    // preserve an existing non-serialized mode (e.g. 'bulk'), default
    // 'non_serialized'. Keeps the tracking_mode-based intake pipeline working.
    const nextTrackingMode: InventoryTrackingMode = isSerialized
      ? "serialized"
      : existing && existing.tracking_mode !== "serialized"
        ? existing.tracking_mode
        : "non_serialized";

    const payload: DbInventoryProductInsert = {
      sku: sku.trim(),
      name: name.trim(),
      description: description.trim() || null,
      // PART-FIX-2: legacy strings preserved verbatim (no longer edited here);
      // the hierarchical leaf is stored in category_id.
      category: category.trim() || null,
      subcategory: subcategory.trim() || null,
      category_id: categoryId,
      manufacturer: manufacturer.trim() || null,
      vendor: vendor.trim() || null,
      tracking_mode: nextTrackingMode,
      is_serialized: isSerialized,
      unit_of_measure: unitOfMeasure.trim() || "each",
      // PART-FIX-1: pack fields only apply to non-"Each" UoM.
      pack_size: isPackUom ? numOrNull(packSize) : null,
      track_individual_units: isPackUom ? trackIndividual : false,
      default_unit_cost: numOrNull(defaultUnitCost),
      // PART-FORM-2: quote-default chooser. Mode → which column drives it:
      //   tier  → margin_tier_id set, list_price cleared
      //   fixed → list_price set,     margin_tier_id cleared
      //   none  → both cleared (the quote line starts blank)
      list_price: quoteMode === "fixed" ? numOrNull(listPrice) : null,
      margin_tier_id: quoteMode === "tier" ? marginTierId || null : null,
      msrp: numOrNull(msrp),
      reorder_point: numOrNull(reorderPoint),
      reorder_qty: numOrNull(reorderQty),
      search_aliases: searchAliases,
      notify_addons: notifyAddons,
      addons,
      upc: upc.trim() || null,
      master_part_number: masterPartNumber.trim() || null,
      replacement_part_number: replacementPartNumber.trim() || null,
      notes: notes.trim() || null,
    };

    startTransition(async () => {
      const result =
        isEdit && existing
          ? await updateProductAction(existing.id, payload)
          : await createProductAction(payload);

      // Part creation failed → nothing was uploaded; surface and stop.
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const newId = result.data.id;

      // PART-FIX-1: in create mode, persist the pending image + attachments now
      // that we have a part id. An orphaned storage object (whose DB row failed)
      // is rolled back; the part stays created so the user can retry on detail.
      if (!isEdit) {
        try {
          if (pendingImage) {
            const path = await uploadProductImage(newId, pendingImage);
            const imgRes = await updateProductAction(newId, {
              image_path: path,
            });
            if (!imgRes.ok) {
              await deleteProductImage(path).catch(() => {});
              throw new Error(imgRes.error);
            }
          }
          for (const pa of pendingAttachments) {
            const obj = await uploadAttachmentObject("product", newId, pa.file);
            const attRes = await createAttachment("product", newId, pa.folder, {
              path: obj.path,
              filename: obj.filename,
              contentType: obj.contentType,
              size: obj.size,
            });
            if (!attRes.ok) {
              await deleteAttachmentObject(obj.path).catch(() => {});
              throw new Error(attRes.error);
            }
          }
        } catch (e) {
          toast.error(
            `Part created, but a file failed to save: ${
              e instanceof Error ? e.message : "upload error"
            }. You can add it from the part page.`
          );
        }
      }

      toast.success(isEdit ? `Updated ${payload.name}` : `Added ${payload.name}`);
      onSubmitSuccess(newId);
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
        {/* IMG-1 / PART-FIX-1: image upload. Edit = live; create = pending,
            persisted on Save. */}
        <ProductImageField
          productId={existing?.id ?? null}
          initialImagePath={existing?.image_path ?? null}
          onPendingChange={setPendingImage}
        />
      </section>

      {/* PART-FIX-1: in create mode, the four document folders are usable now;
          files persist on Save. (Edit mode manages them live on the part page.) */}
      {!isEdit && (
        <section className="space-y-4">
          <PendingAttachments
            folders={["Shop Drawings", "Data Sheets", "Manual", "Misc"]}
            onChange={setPendingAttachments}
          />
        </section>
      )}

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
          {/* PART-FIX-2: cascading category tree. Picking a root reveals its
              children, and so on to arbitrary depth; the deepest pick is stored
              in category_id. */}
          <div className="md:col-span-3">
            <Field label="Category">
              <CategoryCascade
                categories={categories}
                value={categoryId}
                onChange={setCategoryId}
              />
              {/* Legacy parts: show the old free-text values read-only. */}
              {!categoryId && (category || subcategory) && (
                <p className="text-muted-foreground text-[11px] leading-snug">
                  Legacy: {category || "—"}
                  {subcategory ? ` / ${subcategory}` : ""} — pick a tree category
                  to re-classify (the legacy value is kept either way).
                </p>
              )}
            </Field>
          </div>
          <Field label="Manufacturer">
            <Select
              value={manufacturer.trim() === "" ? NONE : manufacturer}
              onValueChange={(v) => setManufacturer(v === NONE ? "" : (v ?? ""))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— None —</SelectItem>
                {withCurrent(manufacturerOptions, manufacturer).map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Vendor">
            <Select
              value={vendor.trim() === "" ? NONE : vendor}
              onValueChange={(v) => setVendor(v === NONE ? "" : (v ?? ""))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— None —</SelectItem>
                {withCurrent(vendorOptions, vendor).map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </section>

      {/* Tracking & pricing */}
      <section className="space-y-4">
        <h2 className="text-brand-navy text-sm font-semibold tracking-wide uppercase">
          Tracking & Pricing
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Serialized part">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={isSerialized}
                onChange={(e) => setIsSerialized(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-sm">
                Serialized
                <span className="text-muted-foreground block text-[11px] leading-snug">
                  Track each unit individually by serial number.
                </span>
              </span>
            </label>
          </Field>
          <Field label="Unit of measure">
            <Select
              value={unitOfMeasure.trim() === "" ? "Each" : unitOfMeasure}
              onValueChange={(v) => setUnitOfMeasure(v ?? "Each")}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {withCurrent(UOM_OPTIONS, unitOfMeasure).map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {/* PART-FIX-1: pack-size + sub-allocate — only for non-"Each" UoM. */}
          {unitOfMeasure.toLowerCase() !== "each" &&
            unitOfMeasure.trim() !== "" && (
            <>
              <Field label={`Units per ${unitOfMeasure.toLowerCase()}`} required>
                <Input
                  type="number"
                  step="1"
                  min="1"
                  value={packSize}
                  onChange={(e) => setPackSize(e.target.value)}
                  placeholder="e.g. 50"
                />
                <p className="text-muted-foreground text-[11px] leading-snug">
                  How many items are in one {unitOfMeasure.toLowerCase()}.
                </p>
              </Field>
              <Field label="Track individual units">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={trackIndividual}
                    onChange={(e) => setTrackIndividual(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="text-muted-foreground text-[11px] leading-snug">
                    If on, each item inside the pack is counted and movable
                    separately. If off, the whole pack is one unit.
                  </span>
                </label>
              </Field>
            </>
          )}
          <Field label="Default Purchase Cost">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={defaultUnitCost}
              onChange={(e) => setDefaultUnitCost(e.target.value)}
              placeholder="0.00"
            />
            <p className="text-muted-foreground text-[11px] leading-snug">
              Purchase Cost = what we pay the vendor.
            </p>
          </Field>
          <Field label="MSRP">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={msrp}
              onChange={(e) => setMsrp(e.target.value)}
              placeholder="0.00"
            />
            <p className="text-muted-foreground text-[11px] leading-snug">
              Manufacturer&rsquo;s suggested retail price. Reference only — never
              used as the quote default.
            </p>
          </Field>
        </div>

        {/* PART-FORM-2: Quote default chooser (replaces the standalone Sell
            Price). Mode picks how a part prices when added to a quote. */}
        <div className="space-y-2">
          <Field label="Quote default">
            <Select
              value={quoteMode}
              onValueChange={(v) =>
                setQuoteMode((v as "tier" | "fixed" | "none") ?? "none")
              }
            >
              <SelectTrigger className="w-full md:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tier">Use margin tier</SelectItem>
                <SelectItem value="fixed">Fixed price</SelectItem>
                <SelectItem value="none">None — set on quote</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-[11px] leading-snug">
              How this part prices when added to a quote.
            </p>
          </Field>

          {quoteMode === "tier" && (
            <Field label="Margin tier">
              <Select
                value={marginTierId}
                onValueChange={(v) => setMarginTierId(v ?? "")}
              >
                <SelectTrigger className="w-full md:w-72">
                  <SelectValue placeholder="Select a margin tier…" />
                </SelectTrigger>
                <SelectContent>
                  {marginTiers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.category} · {Number(t.tier_1)}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-[11px] leading-snug">
                The quote computes sell = cost × the tier markup (uses the tier&rsquo;s
                primary level).
              </p>
            </Field>
          )}

          {quoteMode === "fixed" && (
            <Field label="Fixed price">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={listPrice}
                onChange={(e) => setListPrice(e.target.value)}
                placeholder="0.00"
                className="md:w-72"
              />
              <p className="text-muted-foreground text-[11px] leading-snug">
                The quote uses this exact price as the default.
              </p>
            </Field>
          )}
        </div>
      </section>

      {/* PART-FORM-2: Reorder behavior */}
      <section className="space-y-4">
        <h2 className="text-brand-navy text-sm font-semibold tracking-wide uppercase">
          Reorder behavior
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Reorder point">
            <Input
              type="number"
              step="1"
              min="0"
              value={reorderPoint}
              onChange={(e) => setReorderPoint(e.target.value)}
              placeholder="0"
            />
            <p className="text-muted-foreground text-[11px] leading-snug">
              Trigger a low-stock alert when on-hand drops to or below this.
            </p>
          </Field>
          <Field label="Reorder qty">
            <Input
              type="number"
              step="1"
              min="0"
              value={reorderQty}
              onChange={(e) => setReorderQty(e.target.value)}
              placeholder=""
            />
            <p className="text-muted-foreground text-[11px] leading-snug">
              Default qty to reorder. If blank, the system suggests just enough to
              refill to the reorder point.
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

      {/* Notes (PART-FORM B1) */}
      <section className="space-y-4">
        <h2 className="text-brand-navy text-sm font-semibold tracking-wide uppercase">
          Notes
        </h2>
        <Field label="Notes">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Internal notes about this part…"
          />
        </Field>
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

const CASCADE_SELECT_CLASS =
  "border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full max-w-xs rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

// PART-FIX-2 — cascading category selector over the tree. Renders one select per
// level: roots, then the picked node's children, and so on. The deepest picked
// node id is the stored value; clearing a level moves the leaf up to its parent.
function CategoryCascade({
  categories,
  value,
  onChange,
}: {
  categories: DbInventoryCategory[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const childrenOf = new Map<string, DbInventoryCategory[]>();
  for (const c of categories) {
    const key = c.parent_id ?? "root";
    const arr = childrenOf.get(key) ?? [];
    arr.push(c);
    childrenOf.set(key, arr);
  }

  // Root→leaf id path for the current value.
  const pathIds: string[] = [];
  let node = value ? byId.get(value) : undefined;
  const guard = new Set<string>();
  while (node && !guard.has(node.id)) {
    pathIds.unshift(node.id);
    guard.add(node.id);
    node = node.parent_id ? byId.get(node.parent_id) : undefined;
  }

  // Build the levels to render.
  const levels: { options: DbInventoryCategory[]; selected: string }[] = [];
  let parentKey = "root";
  let i = 0;
  // Render root level always; deeper levels only after a pick that has children.
  while (true) {
    const options = childrenOf.get(parentKey) ?? [];
    if (options.length === 0) break;
    const selected = pathIds[i] ?? "";
    levels.push({ options, selected });
    if (!selected) break;
    parentKey = selected;
    i++;
  }

  if (categories.length === 0) {
    return (
      <p className="text-muted-foreground text-[11px]">
        No categories yet — add them in Settings → Categories.
      </p>
    );
  }

  const handle = (lvl: number, v: string) => {
    if (v === "") {
      // Clearing this level → the leaf becomes the parent (or none at root).
      onChange(lvl === 0 ? null : (pathIds[lvl - 1] ?? null));
    } else {
      onChange(v);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {levels.map((lvl, idx) => (
        <select
          key={idx}
          value={lvl.selected}
          onChange={(e) => handle(idx, e.target.value)}
          className={CASCADE_SELECT_CLASS}
          aria-label={idx === 0 ? "Category" : `Sub-category level ${idx + 1}`}
        >
          <option value="">
            {idx === 0 ? "Select a category…" : "Select…"}
          </option>
          {lvl.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}
