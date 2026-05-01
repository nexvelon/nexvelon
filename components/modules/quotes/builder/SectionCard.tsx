"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  HardHat,
  Plus,
  Trash2,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LineItemRow } from "./LineItemRow";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import {
  emptyLineItem,
  laborLineItem,
  newId,
  sectionSubtotal,
} from "@/lib/quote-helpers";
import type { BuilderLineItem, QuoteSection } from "@/lib/types";

interface Props {
  section: QuoteSection;
  sections: QuoteSection[];
  showCost: boolean;
  disabled?: boolean;
  onUpdateSection: (next: QuoteSection) => void;
  onMoveItemToSection: (itemId: string, targetSectionId: string) => void;
  onDeleteSection: () => void;
  onMoveSection: (dir: "up" | "down") => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export function SectionCard({
  section,
  sections,
  showCost,
  disabled,
  onUpdateSection,
  onMoveItemToSection,
  onDeleteSection,
  onMoveSection,
  canMoveUp,
  canMoveDown,
}: Props) {
  const [editingName, setEditingName] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const subtotal = sectionSubtotal(section);

  const updateItem = (next: BuilderLineItem) =>
    onUpdateSection({
      ...section,
      items: section.items.map((it) => (it.id === next.id ? next : it)),
    });

  const removeItem = (id: string) =>
    onUpdateSection({
      ...section,
      items: section.items.filter((it) => it.id !== id),
    });

  const duplicateItem = (id: string) => {
    const target = section.items.find((it) => it.id === id);
    if (!target) return;
    const dup: BuilderLineItem = { ...target, id: newId("li") };
    const idx = section.items.findIndex((it) => it.id === id);
    const items = [...section.items];
    items.splice(idx + 1, 0, dup);
    onUpdateSection({ ...section, items });
  };

  const addProduct = () =>
    onUpdateSection({ ...section, items: [...section.items, emptyLineItem()] });

  const addLabor = () =>
    onUpdateSection({ ...section, items: [...section.items, laborLineItem()] });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = section.items.findIndex((it) => it.id === active.id);
    const newIdx = section.items.findIndex((it) => it.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onUpdateSection({
      ...section,
      items: arrayMove(section.items, oldIdx, newIdx),
    });
  };

  return (
    <Card className="overflow-hidden">
      <div className="bg-brand-navy/5 flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        {editingName ? (
          <Input
            value={section.name}
            autoFocus
            onChange={(e) =>
              onUpdateSection({ ...section, name: e.target.value })
            }
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setEditingName(false);
            }}
            className="h-8 max-w-md"
            disabled={disabled}
          />
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setEditingName(true)}
            className="hover:text-brand-gold disabled:hover:text-brand-navy text-brand-navy text-left font-serif text-base font-semibold tracking-wide"
          >
            {section.name || "Untitled section"}
          </button>
        )}

        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-xs">
            <span className="text-brand-charcoal font-semibold tabular-nums">
              {formatCurrency(subtotal)}
            </span>{" "}
            section subtotal · {section.items.length}{" "}
            {section.items.length === 1 ? "row" : "rows"}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onMoveSection("up")}
              disabled={disabled || !canMoveUp}
              aria-label="Move section up"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onMoveSection("down")}
              disabled={disabled || !canMoveDown}
              aria-label="Move section down"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onDeleteSection}
              disabled={disabled}
              className="text-red-600 hover:text-red-700"
              aria-label="Delete section"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-muted-foreground bg-muted/40 text-[10px] uppercase tracking-wider">
              <th className="w-7"></th>
              <th className="px-1.5 py-2 text-left">Vendor</th>
              <th className="px-1.5 py-2 text-left">SKU</th>
              <th className="px-1.5 py-2 text-left">Description</th>
              <th className="px-1.5 py-2 text-right">Qty</th>
              {showCost && <th className="px-1.5 py-2 text-right">Unit cost</th>}
              {showCost && <th className="px-1.5 py-2 text-right">Markup</th>}
              <th className="px-1.5 py-2 text-right">Unit price</th>
              <th className="px-1.5 py-2 text-right">Line total</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={section.items.map((it) => it.id)}
              strategy={verticalListSortingStrategy}
            >
              <tbody>
                {section.items.length === 0 && (
                  <tr>
                    <td
                      colSpan={showCost ? 10 : 8}
                      className="text-muted-foreground py-6 text-center text-xs"
                    >
                      Empty section — add a line item below.
                    </td>
                  </tr>
                )}
                {section.items.map((item) => (
                  <LineItemRow
                    key={item.id}
                    item={item}
                    sectionId={section.id}
                    sections={sections}
                    showCost={showCost}
                    disabled={disabled}
                    onChange={updateItem}
                    onDuplicate={() => duplicateItem(item.id)}
                    onDelete={() => removeItem(item.id)}
                    onMoveTo={(targetId) =>
                      onMoveItemToSection(item.id, targetId)
                    }
                    onAddNote={() =>
                      updateItem({
                        ...item,
                        notes:
                          item.notes ??
                          "Internal note — visible on the builder, hidden on the PDF.",
                      })
                    }
                  />
                ))}
              </tbody>
            </SortableContext>
          </DndContext>
        </table>
      </div>

      <div
        className={cn(
          "flex flex-wrap items-center gap-2 border-t border-[var(--border)] px-4 py-2"
        )}
      >
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addProduct}
          disabled={disabled}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Product line
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addLabor}
          disabled={disabled}
        >
          <HardHat className="mr-1 h-3.5 w-3.5" />
          Labor line
        </Button>
      </div>
    </Card>
  );
}
