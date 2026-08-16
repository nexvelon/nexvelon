"use client";

// UIDG-8 — renders the resolved layout on a 12-column grid, and (in edit mode, on
// desktop) makes the widgets sortable via @dnd-kit, matching the app's kanban
// pattern (useSortable + SortableContext + arrayMove) plus the keyboard sensor the
// kanban omits — reordering must be keyboard-accessible. Each widget declares a
// colSpan; on mobile the grid collapses to a single ordered column (spans clamp to
// full width) and editing is disabled upstream.

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Minus, Plus, X } from "lucide-react";
import { WIDGET_COMPONENTS } from "./widget-registry";
import { WIDGET_META, type LayoutEntry } from "@/lib/dashboard/widgets";

const WIDTH_LADDER = [4, 6, 8, 12];

function nextWidth(current: number, min: number, dir: 1 | -1): number {
  const allowed = WIDTH_LADDER.filter((w) => w >= min);
  // snap current onto the ladder, then step
  let idx = allowed.findIndex((w) => w >= current);
  if (idx < 0) idx = allowed.length - 1;
  const next = Math.min(allowed.length - 1, Math.max(0, idx + dir));
  return allowed[next];
}

interface Props {
  layout: LayoutEntry[];
  editMode: boolean;
  onReorder: (next: LayoutEntry[]) => void;
  onRemove: (id: string) => void;
  onResize: (id: string, colSpan: number) => void;
}

export function DashboardGrid({ layout, editMode, onReorder, onRemove, onResize }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const grid = (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {layout.map((entry) => (
        <WidgetCell
          key={entry.id}
          entry={entry}
          editMode={editMode}
          onRemove={onRemove}
          onResize={onResize}
        />
      ))}
    </div>
  );

  if (!editMode) return grid;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = layout.findIndex((w) => w.id === active.id);
    const newIdx = layout.findIndex((w) => w.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onReorder(arrayMove(layout, oldIdx, newIdx));
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <SortableContext items={layout.map((w) => w.id)} strategy={rectSortingStrategy}>
        {grid}
      </SortableContext>
    </DndContext>
  );
}

function WidgetCell({
  entry,
  editMode,
  onRemove,
  onResize,
}: {
  entry: LayoutEntry;
  editMode: boolean;
  onRemove: (id: string) => void;
  onResize: (id: string, colSpan: number) => void;
}) {
  const meta = WIDGET_META[entry.id];
  const Component = WIDGET_COMPONENTS[entry.id];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    disabled: !editMode,
  });

  const style: React.CSSProperties = {
    gridColumn: `span ${entry.colSpan}`,
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative ${isDragging ? "z-10 opacity-60" : ""}`}
    >
      {editMode && (
        <div
          className="bg-card/95 absolute -top-3 right-2 z-20 flex items-center gap-1 rounded-md border px-1 py-0.5 shadow-sm"
          style={{ borderColor: "var(--brand-border)" }}
        >
          <button
            type="button"
            className="text-muted-foreground hover:text-brand-navy cursor-grab active:cursor-grabbing"
            aria-label={`Move ${meta.title}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          {meta.resizable && (
            <>
              <button
                type="button"
                className="text-muted-foreground hover:text-brand-navy disabled:opacity-30"
                aria-label={`Make ${meta.title} narrower`}
                disabled={entry.colSpan <= meta.minCols}
                onClick={() => onResize(entry.id, nextWidth(entry.colSpan, meta.minCols, -1))}
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:text-brand-navy disabled:opacity-30"
                aria-label={`Make ${meta.title} wider`}
                disabled={entry.colSpan >= 12}
                onClick={() => onResize(entry.id, nextWidth(entry.colSpan, meta.minCols, 1))}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <button
            type="button"
            className="text-muted-foreground hover:text-destructive"
            aria-label={`Remove ${meta.title}`}
            onClick={() => onRemove(entry.id)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* In edit mode the content is inert so a drag/keyboard reorder never fires a
          link inside a widget; only the toolbar above is interactive. */}
      <div
        className={
          editMode
            ? "pointer-events-none rounded-lg outline-dashed outline-1 outline-offset-4 outline-[var(--brand-border)]"
            : ""
        }
      >
        <Component />
      </div>
    </div>
  );
}
