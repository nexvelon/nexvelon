"use client";

// QUOTE-LABOUR — the per-labour-line options sub-row rendered directly beneath a
// labour LineItemRow in the builder. Holds the optional internal tech-name note
// and the three PER-LINE PDF visibility toggles (all default OFF). These affect
// only the client-facing PDF; the builder always shows full internal detail.

import { Input } from "@/components/ui/input";
import type { BuilderLineItem } from "@/lib/types";

interface Props {
  item: BuilderLineItem;
  colSpan: number;
  disabled?: boolean;
  onChange: (next: BuilderLineItem) => void;
}

export function LabourOptionsRow({ item, colSpan, disabled, onChange }: Props) {
  const labour = item.labour;
  if (!labour) return null;
  const show = labour.show ?? {};

  const setShow = (patch: { description?: boolean; hours?: boolean; rate?: boolean }) =>
    onChange({
      ...item,
      labour: { ...labour, show: { ...show, ...patch } },
    });

  return (
    <tr className="border-t border-[var(--border)] bg-muted/20">
      <td colSpan={colSpan} className="px-4 py-2">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <label className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground uppercase tracking-wide">
              Tech
            </span>
            <Input
              value={labour.techName ?? ""}
              onChange={(e) =>
                onChange({
                  ...item,
                  labour: { ...labour, techName: e.target.value || undefined },
                })
              }
              disabled={disabled}
              placeholder="Internal note"
              className="h-7 w-40 text-xs"
            />
          </label>

          <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
            PDF visibility
          </span>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={!!show.description}
              onChange={(e) => setShow({ description: e.target.checked })}
              disabled={disabled}
              className="h-3.5 w-3.5 accent-[var(--brand-navy)]"
            />
            Show description
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={!!show.hours}
              onChange={(e) => setShow({ hours: e.target.checked })}
              disabled={disabled}
              className="h-3.5 w-3.5 accent-[var(--brand-navy)]"
            />
            Show hours
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={!!show.rate}
              onChange={(e) => setShow({ rate: e.target.checked })}
              disabled={disabled}
              className="h-3.5 w-3.5 accent-[var(--brand-navy)]"
            />
            Show rate
          </label>

          <span className="text-muted-foreground text-[11px] italic">
            Total is always shown. Toggles control what else the client sees.
          </span>
        </div>
      </td>
    </tr>
  );
}
