"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { newId } from "@/lib/quote-helpers";
import type { AssuranceCard } from "@/lib/quote-schedules";

interface Props {
  cards: AssuranceCard[];
  onChange: (next: AssuranceCard[]) => void;
  disabled?: boolean;
}

function newCard(): AssuranceCard {
  return {
    id: newId("card"),
    tier: "GOLD TIER",
    ornament: "⚜",
    title: "New tier",
    description: "",
  };
}

export function AssuranceCardEditor({ cards, onChange, disabled }: Props) {
  const patchAt = (idx: number, patch: Partial<AssuranceCard>) => {
    onChange(cards.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const move = (idx: number, dir: "up" | "down") => {
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= cards.length) return;
    const next = [...cards];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };

  const remove = (idx: number) => {
    onChange(cards.filter((_, i) => i !== idx));
  };

  const append = () => onChange([...cards, newCard()]);

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-[11px]">
        Warranty &amp; service cards. Each renders as a tile on the Assurance
        page.
      </p>

      <div className="space-y-2">
        {cards.map((card, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === cards.length - 1;
          return (
            <div
              key={card.id}
              className="bg-background space-y-1.5 rounded-md border border-[var(--border)] p-2"
            >
              <div className="flex items-start gap-1.5">
                <div className="flex flex-col gap-0.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    disabled={disabled || isFirst}
                    onClick={() => move(idx, "up")}
                    aria-label="Move card up"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    disabled={disabled || isLast}
                    onClick={() => move(idx, "down")}
                    aria-label="Move card down"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                </div>

                <Input
                  value={card.tier}
                  onChange={(e) => patchAt(idx, { tier: e.target.value })}
                  disabled={disabled}
                  placeholder="GOLD TIER"
                  className="h-7 w-24 text-[11px] uppercase tracking-wide"
                  aria-label="Tier label"
                />
                <Input
                  value={card.ornament}
                  onChange={(e) =>
                    patchAt(idx, {
                      // single visible glyph (allows multi-byte chars but
                      // trims any extra typed after the first grapheme).
                      ornament: Array.from(e.target.value)[0] ?? "",
                    })
                  }
                  disabled={disabled}
                  placeholder="⚜"
                  className="h-7 w-10 text-center text-base"
                  aria-label="Ornament"
                />
                <Input
                  value={card.title}
                  onChange={(e) => patchAt(idx, { title: e.target.value })}
                  disabled={disabled}
                  placeholder="Hardware Warranty"
                  className="h-7 flex-1 text-sm"
                  aria-label="Card title"
                />

                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive h-7 w-7 p-0"
                  disabled={disabled}
                  onClick={() => remove(idx)}
                  aria-label="Delete card"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <Textarea
                value={card.description}
                onChange={(e) =>
                  patchAt(idx, { description: e.target.value })
                }
                disabled={disabled}
                rows={2}
                placeholder="36 months · parts & labour · OEM-backed"
                className="text-xs"
                aria-label="Card description"
              />
            </div>
          );
        })}
      </div>

      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={append}
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        Add card
      </Button>
    </div>
  );
}
