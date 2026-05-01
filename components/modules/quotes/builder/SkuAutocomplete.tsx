"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { products } from "@/lib/mock-data/products";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/types";
import { formatCurrency } from "@/lib/format";

interface Props {
  value: string;
  onChange: (text: string) => void;
  onPick: (p: Product) => void;
  disabled?: boolean;
}

export function SkuAutocomplete({ value, onChange, onPick, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          p.sku.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.manufacturer.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [value]);

  useEffect(() => {
    setActiveIdx(0);
  }, [value]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || matches.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => Math.min(matches.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const pick = matches[activeIdx];
            if (pick) {
              onPick(pick);
              setOpen(false);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="SKU…"
        className="font-mono text-xs"
        disabled={disabled}
      />
      {open && matches.length > 0 && (
        <ul className="bg-card absolute z-30 mt-1 max-h-72 w-[28rem] overflow-y-auto rounded-md border border-[var(--border)] shadow-lg">
          {matches.map((p, idx) => (
            <li
              key={p.id}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(p);
                setOpen(false);
              }}
              onMouseEnter={() => setActiveIdx(idx)}
              className={cn(
                "cursor-pointer px-3 py-2 text-xs",
                idx === activeIdx ? "bg-brand-gold/10" : "hover:bg-muted"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-brand-navy font-mono font-semibold">
                  {p.sku}
                </span>
                <span className="text-muted-foreground">{p.vendor}</span>
              </div>
              <div className="text-brand-charcoal mt-0.5 truncate">
                {p.name}
              </div>
              <div className="text-muted-foreground mt-0.5 flex justify-between">
                <span>{p.manufacturer} · {p.category}</span>
                <span className="tabular-nums">cost {formatCurrency(p.cost)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
