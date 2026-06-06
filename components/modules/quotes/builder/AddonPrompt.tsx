"use client";

// D-2 — companion add-ons prompt. Opened when a user adds a part that has
// notify_addons on and resolvable add-ons. Lists the Part # companions as a
// checklist (default-checked unless already in the section) plus any text
// reminders, read-only. "Add selected" returns the chosen products; "Skip"
// closes without adding. The triggering part is already in the quote either way.

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Product } from "@/lib/types";

export interface AddonPromptData {
  sectionId: string;
  productName: string;
  // Resolved part-kind companions + whether each is already in the section.
  parts: { product: Product; alreadyInSection: boolean }[];
  texts: string[];
}

export function AddonPrompt({
  data,
  onAdd,
  onClose,
}: {
  data: AddonPromptData | null;
  onAdd: (sectionId: string, products: Product[]) => void;
  onClose: () => void;
}) {
  // Default-check companions that aren't already in the section.
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  // Re-seed defaults whenever a new prompt opens (keyed remount handles this).
  const open = data !== null;

  const toggle = (id: string) =>
    setChecked((c) => ({ ...c, [id]: !c[id] }));

  const isChecked = (p: { product: Product; alreadyInSection: boolean }) =>
    checked[p.product.id] ?? !p.alreadyInSection;

  const handleAdd = () => {
    if (!data) return;
    const selected = data.parts
      .filter((p) => isChecked(p))
      .map((p) => p.product);
    onAdd(data.sectionId, selected);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{data?.productName} has companion items</DialogTitle>
          <DialogDescription>
            Add the recommended companions to this section, or skip.
          </DialogDescription>
        </DialogHeader>

        {data && (
          <div className="space-y-4">
            {data.parts.length > 0 && (
              <ul className="space-y-1.5">
                {data.parts.map((p) => (
                  <li key={p.product.id}>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={isChecked(p)}
                        onChange={() => toggle(p.product.id)}
                      />
                      <span className="text-brand-navy font-mono text-xs font-semibold">
                        {p.product.sku}
                      </span>
                      <span className="text-brand-charcoal truncate">
                        {p.product.name}
                      </span>
                      {p.alreadyInSection && (
                        <span className="text-muted-foreground text-[10px]">
                          (already in quote)
                        </span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            )}

            {data.texts.length > 0 && (
              <div className="space-y-1">
                {data.texts.map((t, i) => (
                  <p key={i} className="text-muted-foreground text-xs">
                    Recommended: {t}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Skip
          </Button>
          <Button
            onClick={handleAdd}
            disabled={!data || data.parts.every((p) => !isChecked(p))}
          >
            Add selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
