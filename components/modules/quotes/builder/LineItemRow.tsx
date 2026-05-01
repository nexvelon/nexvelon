"use client";

import {
  Copy,
  GripVertical,
  MoreHorizontal,
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
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import {
  lineItemTotal,
  recalcLineItem,
} from "@/lib/quote-helpers";
import type { BuilderLineItem, Product, QuoteSection, Vendor } from "@/lib/types";

const VENDORS: Vendor[] = ["ADI", "Anixter", "Wesco", "CDW"];

interface Props {
  item: BuilderLineItem;
  sectionId: string;
  sections: QuoteSection[];
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
  showCost,
  disabled,
  onChange,
  onDuplicate,
  onDelete,
  onMoveTo,
  onAddNote,
}: Props) {
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
        type: "product",
        productId: p.id,
        sku: p.sku,
        vendor: p.vendor,
        description: p.name,
        unitCost: p.cost,
        markup: item.markup || 30,
      })
    );
  };

  const total = lineItemTotal(item);

  if (item.type === "labor") {
    return (
      <tr
        ref={setNodeRef}
        style={style}
        className={cn("border-t border-[var(--border)]", isDragging && "z-10")}
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
        <td colSpan={2} className="py-1.5 pr-2">
          <Input
            value={item.description}
            onChange={(e) => onChange({ ...item, description: e.target.value })}
            placeholder="Labor description (e.g. Installation & Programming)"
            disabled={disabled}
            className="text-xs"
          />
        </td>
        <td className="px-1.5">
          <Input
            inputMode="decimal"
            value={item.hours?.toString() ?? "0"}
            onChange={(e) => {
              const h = parseFloat(e.target.value);
              onChange({ ...item, hours: isNaN(h) ? 0 : h });
            }}
            disabled={disabled}
            className="text-right text-xs tabular-nums"
            placeholder="hrs"
          />
        </td>
        <td className="px-1.5">
          <CurrencyInput
            value={item.rate ?? 0}
            onChange={(v) => onChange({ ...item, rate: v })}
            disabled={disabled}
            className="text-xs"
            placeholder="$/hr"
          />
        </td>
        <td className="px-1.5">
          <span className="text-muted-foreground block text-right text-[11px]">
            labor
          </span>
        </td>
        <td className="px-1.5">
          <span className="text-muted-foreground block text-right text-[11px]">
            —
          </span>
        </td>
        <td className="px-1.5 pl-3 text-right">
          <span className="text-brand-navy text-xs font-semibold tabular-nums">
            {formatCurrency(total)}
          </span>
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

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={cn("border-t border-[var(--border)]", isDragging && "z-10")}
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

      <td className="w-28 px-1.5 py-1.5">
        <Select
          value={item.vendor}
          onValueChange={(v) => onChange({ ...item, vendor: (v ?? undefined) as Vendor | undefined })}
          disabled={disabled}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="Vendor" />
          </SelectTrigger>
          <SelectContent>
            {VENDORS.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>

      <td className="w-32 px-1.5">
        <SkuAutocomplete
          value={item.sku ?? ""}
          onChange={handleSkuChange}
          onPick={handlePick}
          disabled={disabled}
        />
      </td>

      <td className="min-w-0 px-1.5">
        <Input
          value={item.description}
          onChange={(e) => onChange({ ...item, description: e.target.value })}
          disabled={disabled}
          className="text-xs"
          placeholder="Description"
        />
      </td>

      <td className="w-16 px-1.5">
        <Input
          inputMode="numeric"
          value={item.qty.toString()}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            onChange(recalcLineItem({ ...item, qty: isNaN(n) ? 0 : n }));
          }}
          disabled={disabled}
          className="text-right text-xs tabular-nums"
        />
      </td>

      {showCost && (
        <td className="w-24 px-1.5">
          <CurrencyInput
            value={item.unitCost}
            onChange={(v) =>
              onChange(recalcLineItem({ ...item, unitCost: v }))
            }
            disabled={disabled}
            className="text-xs"
          />
        </td>
      )}

      {showCost && (
        <td className="w-16 px-1.5">
          <Input
            inputMode="decimal"
            value={item.markup.toString()}
            onChange={(e) => {
              const m = parseFloat(e.target.value);
              onChange(recalcLineItem({ ...item, markup: isNaN(m) ? 0 : m }));
            }}
            disabled={disabled}
            className="text-right text-xs tabular-nums"
          />
        </td>
      )}

      <td className="w-24 px-1.5">
        <CurrencyInput
          value={item.unitPrice}
          onChange={(v) => onChange({ ...item, unitPrice: v })}
          disabled={disabled}
          className="text-xs"
        />
      </td>

      <td className="w-24 px-1.5 pl-3 text-right">
        <span className="text-brand-navy text-xs font-semibold tabular-nums">
          {formatCurrency(total)}
        </span>
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
