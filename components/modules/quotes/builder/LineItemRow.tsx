"use client";

import { useState } from "react";
import {
  Copy,
  GripVertical,
  MoreHorizontal,
  Pin,
  StickyNote,
  Trash2,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CurrencyInput } from "./CurrencyInput";
import { SkuAutocomplete } from "./SkuAutocomplete";
import { StockUnitPicker } from "./StockUnitPicker";
import { useOfferAddons } from "./addons-context";
import { useCatalogProducts } from "./catalog-context";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import {
  lineItemTotal,
  recalcLineItem,
  recalcMarginFromPrice,
} from "@/lib/quote-helpers";
import {
  classificationsFor,
  type LineItemClassification,
} from "@/lib/classifications";
import type { BuilderLineItem, Product, QuoteSection, Vendor } from "@/lib/types";

const VENDORS: Vendor[] = ["ADI", "Anixter", "Wesco", "CDW"];
const VENDOR_NONE = "__none__";

interface Props {
  item: BuilderLineItem;
  sectionId: string;
  sections: QuoteSection[];
  classifications?: LineItemClassification[];
  showCost: boolean;
  disabled?: boolean;
  onChange: (next: BuilderLineItem) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveTo: (sectionId: string) => void;
  onAddNote: () => void;
}

export function LineItemRow({
  item,
  sectionId,
  sections,
  classifications,
  showCost,
  disabled,
  onChange,
  onDuplicate,
  onDelete,
  onMoveTo,
  onAddNote,
}: Props) {
  const offerAddons = useOfferAddons();
  const catalog = useCatalogProducts();
  const [pinOpen, setPinOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const handleSkuChange = (sku: string) => {
    onChange({ ...item, sku });
  };

  const handlePick = (p: Product) => {
    onChange(
      recalcLineItem({
        ...item,
        // INV-4: link the picked catalog product so cost-tracking + future
        // reporting can tie this line back to inventory (was omitted here;
        // the command-palette path already set it).
        productId: p.id,
        name: p.name,
        sku: p.sku,
        // CAT-2: snapshot part identifiers from the product at add-time.
        upc: p.upc,
        masterPartNumber: p.masterPartNumber,
        vendor: p.vendor,
        // INV-4: unitCost snapshots the catalog default_unit_cost (Product.cost
        // via the INV-2a adapter); §2.2 — the copied value is the snapshot.
        unitCost: p.cost,
        margin: item.margin || 40,
        // classification intentionally omitted to preserve the user's selection
      })
    );
    // D-2: a user pick may offer this part's companion add-ons.
    offerAddons(sectionId, p);
  };

  // F-2: pin/unpin this line to a specific stock unit's cost.
  const handlePin = (stockUnitId: string, unitCost: number) => {
    onChange(recalcLineItem({ ...item, unitCost, stockUnitId }));
  };
  const handleUnpin = () => {
    // Revert to the product's default cost (0 if the product isn't resolvable).
    const def = catalog.find((p) => p.id === item.productId)?.cost ?? 0;
    onChange(recalcLineItem({ ...item, unitCost: def, stockUnitId: undefined }));
  };

  const total = lineItemTotal(item);
  const classOptions = classificationsFor(classifications, item.type);
  const classValue = classOptions.some((c) => c.name === item.classification)
    ? item.classification
    : undefined;
  const isLabor = item.type === "labor";
  // QUOTE-LABOUR: a managed labour line (carries labour metadata). Its qty IS
  // the hours and its unitPrice IS the sell rate; we keep labour.hours /
  // labour.sellRate in sync on every edit, and never let cost/margin overwrite
  // the directly-entered sell rate. Legacy "labor" lines (no metadata) keep
  // their original part-style behavior untouched.
  const labour = item.labour;
  const isLabourLine = !!labour;
  const changeLabourHours = (n: number) =>
    onChange({ ...item, qty: n, labour: { ...labour!, hours: n } });
  // BUGFIX — editing the labour sell rate now also recomputes margin (holds
  // cost), so the displayed margin reflects the manually-entered rate.
  const changeLabourRate = (v: number) => {
    const next = recalcMarginFromPrice(item, v);
    onChange({ ...next, labour: { ...labour!, sellRate: next.unitPrice } });
  };
  // Cost/margin edits recompute unitPrice via recalcLineItem; mirror that back
  // into labour.sellRate so the snapshot stays consistent with the price.
  const changeLabourCostMargin = (next: BuilderLineItem) =>
    onChange({ ...next, labour: { ...labour!, sellRate: next.unitPrice } });

  // Parts and labour share one unified cell layout (QB-3).
  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={cn(
        "border-t border-[var(--border)] align-middle",
        isDragging && "z-10"
      )}
    >
      <td className="w-7 align-middle">
        <button
          type="button"
          {...attributes}
          {...listeners}
          disabled={disabled}
          className="text-muted-foreground hover:text-brand-navy disabled:opacity-30 cursor-grab px-1 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </td>

      <td className="w-20 px-1.5 py-1.5">
        {isLabor ? (
          <Input value="" disabled className="text-xs" placeholder="—" />
        ) : (
          <Select
            value={item.vendor ?? VENDOR_NONE}
            onValueChange={(v) =>
              onChange({
                ...item,
                vendor:
                  v && v !== VENDOR_NONE ? (v as Vendor) : undefined,
              })
            }
            disabled={disabled}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue>
                {item.vendor ? (
                  item.vendor
                ) : (
                  <span className="text-muted-foreground">Vendor</span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={VENDOR_NONE}>None</SelectItem>
              {VENDORS.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </td>

      <td className="w-20 px-1.5">
        {isLabor ? (
          <Input
            value=""
            disabled
            className="text-xs"
            placeholder="—"
          />
        ) : (
          <SkuAutocomplete
            value={item.sku ?? ""}
            onChange={handleSkuChange}
            onPick={handlePick}
            disabled={disabled}
          />
        )}
      </td>

      <td className="min-w-[10rem] px-1.5">
        {isLabourLine ? (
          <Input value="" disabled className="text-xs" placeholder="—" />
        ) : (
          <Input
            value={item.name}
            onChange={(e) => onChange({ ...item, name: e.target.value })}
            disabled={disabled}
            className="text-xs"
            placeholder={isLabor ? "Service name" : "Part name"}
          />
        )}
      </td>

      <td className="min-w-[10rem] px-1.5">
        <Input
          value={item.description}
          onChange={(e) => onChange({ ...item, description: e.target.value })}
          disabled={disabled}
          className="text-xs"
          placeholder={
            isLabourLine ? "Labour" : isLabor ? "Notes" : "Description"
          }
        />
        {/* INV-2: serial snapshot from a committed serialized unit. */}
        {item.serialNumber ? (
          <span className="text-muted-foreground mt-0.5 block font-mono text-[10px]">
            SN {item.serialNumber}
          </span>
        ) : null}
      </td>

      <td className="w-12 px-1.5 text-right">
        <Input
          inputMode="decimal"
          value={item.qty.toString()}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            const val = isNaN(n) ? 0 : n;
            if (isLabourLine) changeLabourHours(val);
            else onChange(recalcLineItem({ ...item, qty: val }));
          }}
          disabled={disabled}
          className="text-right text-xs tabular-nums"
        />
      </td>

      {showCost && (
        <td className="w-24 px-1.5 text-right">
          <CurrencyInput
            value={item.unitCost}
            onChange={(v) => {
              const next = recalcLineItem({ ...item, unitCost: v });
              if (isLabourLine) changeLabourCostMargin(next);
              else onChange(next);
            }}
            disabled={disabled}
            className="text-xs"
          />
          {item.type === "product" && item.productId && (
            <div className="mt-0.5 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setPinOpen(true)}
                disabled={disabled}
                className={cn(
                  "inline-flex items-center gap-0.5 text-[10px]",
                  item.stockUnitId
                    ? "text-amber-700"
                    : "text-muted-foreground hover:text-brand-charcoal"
                )}
                title={
                  item.stockUnitId
                    ? "Pinned to a stock unit's cost"
                    : "Pin to a stock unit's cost"
                }
              >
                <Pin className="h-2.5 w-2.5" />
                {item.stockUnitId ? "Pinned" : "Pin stock"}
              </button>
            </div>
          )}
          {item.type === "product" && item.productId && (
            <StockUnitPicker
              productId={item.productId}
              pinnedStockUnitId={item.stockUnitId}
              open={pinOpen}
              onOpenChange={setPinOpen}
              onPin={handlePin}
              onUnpin={handleUnpin}
            />
          )}
        </td>
      )}

      {showCost && (
        <td className="w-12 px-1.5 text-right">
          <Input
            inputMode="decimal"
            value={item.margin.toString()}
            onChange={(e) => {
              const m = parseFloat(e.target.value);
              const next = recalcLineItem({ ...item, margin: isNaN(m) ? 0 : m });
              if (isLabourLine) changeLabourCostMargin(next);
              else onChange(next);
            }}
            disabled={disabled}
            className="text-right text-xs tabular-nums"
          />
        </td>
      )}

      <td className="w-24 px-1.5 text-right">
        <CurrencyInput
          value={item.unitPrice}
          onChange={(v) => {
            // BUGFIX — editing SP recomputes margin (holds cost), fixing the
            // prior one-way binding where SP changes left margin stale.
            if (isLabourLine) changeLabourRate(v);
            else onChange(recalcMarginFromPrice(item, v));
          }}
          disabled={disabled}
          className="text-xs"
        />
      </td>

      <td className="w-24 px-1.5 pl-3 text-right">
        <span className="text-brand-navy text-xs font-semibold tabular-nums">
          {formatCurrency(total)}
        </span>
      </td>

      <td className="w-32 px-1.5">
        <Select
          value={classValue}
          onValueChange={(v) =>
            onChange({ ...item, classification: v ?? undefined })
          }
          disabled={disabled}
        >
          <SelectTrigger className="h-7 truncate text-xs">
            <SelectValue placeholder="Select type…" />
          </SelectTrigger>
          <SelectContent>
            {classOptions.map((c) => (
              <SelectItem key={c.name} value={c.name}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>

      <td className="w-10 text-right">
        <RowMenu
          disabled={disabled}
          sections={sections}
          sectionId={sectionId}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onMoveTo={onMoveTo}
          onAddNote={onAddNote}
        />
      </td>
    </tr>
  );
}

function RowMenu({
  disabled,
  sections,
  sectionId,
  onDuplicate,
  onDelete,
  onMoveTo,
  onAddNote,
}: {
  disabled?: boolean;
  sections: QuoteSection[];
  sectionId: string;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveTo: (id: string) => void;
  onAddNote: () => void;
}) {
  const otherSections = sections.filter((s) => s.id !== sectionId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className="text-muted-foreground hover:bg-muted hover:text-brand-charcoal inline-flex h-7 w-7 items-center justify-center rounded disabled:opacity-30"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={onDuplicate}>
          <Copy className="mr-2 h-3.5 w-3.5" />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onAddNote}>
          <StickyNote className="mr-2 h-3.5 w-3.5" />
          Add note
        </DropdownMenuItem>
        {otherSections.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] uppercase">
              Move to section
            </DropdownMenuLabel>
            {otherSections.map((s) => (
              <DropdownMenuItem key={s.id} onClick={() => onMoveTo(s.id)}>
                {s.name}
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-red-600">
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          Delete row
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
