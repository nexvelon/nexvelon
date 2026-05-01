"use client";

import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { products } from "@/lib/mock-data/products";
import { formatCurrency } from "@/lib/format";
import type { Product, QuoteSection } from "@/lib/types";

interface Props {
  sections: QuoteSection[];
  onAddProductToSection: (sectionId: string, p: Product) => void;
}

export function CommandPalette({ sections, onAddProductToSection }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const targetSection = sections[0];

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Add line item"
      description="Search the catalog by SKU, name, or manufacturer. Press Enter to add to the first section."
    >
      <CommandInput placeholder="Search SKU, manufacturer, or product name…" />
      <CommandList>
        <CommandEmpty>No matching products.</CommandEmpty>
        {sections.length > 1 && (
          <>
            <CommandGroup heading="Add to section">
              {sections.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`section-${s.name}`}
                  onSelect={() => {
                    /* intentionally a label only */
                  }}
                  disabled
                >
                  <span className="text-muted-foreground text-[11px] uppercase">
                    {s.name}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
        <CommandGroup heading="Catalog">
          {products.slice(0, 50).map((p) => (
            <CommandItem
              key={p.id}
              value={`${p.sku} ${p.name} ${p.manufacturer}`}
              onSelect={() => {
                if (targetSection) {
                  onAddProductToSection(targetSection.id, p);
                  setOpen(false);
                }
              }}
            >
              <div className="flex w-full items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-brand-navy font-mono text-xs font-semibold">
                      {p.sku}
                    </span>
                    <span className="text-muted-foreground text-[11px]">
                      {p.vendor} · {p.manufacturer}
                    </span>
                  </div>
                  <div className="text-brand-charcoal truncate text-xs">
                    {p.name}
                  </div>
                </div>
                <span className="text-brand-charcoal shrink-0 text-xs tabular-nums">
                  {formatCurrency(p.cost)}
                </span>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
