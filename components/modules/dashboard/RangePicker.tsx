"use client";

import { Calendar, ChevronDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RANGE_LABEL, type RangeKey } from "@/lib/dashboard-data";

const ORDER: RangeKey[] = ["today", "7d", "mtd", "qtd", "ytd", "custom"];

interface RangePickerProps {
  value: RangeKey;
  onChange: (next: RangeKey) => void;
}

export function RangePicker({ value, onChange }: RangePickerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={buttonVariants({
          variant: "outline",
          size: "sm",
          className:
            "border-brand-navy/15 text-brand-charcoal hover:bg-brand-gold/10 gap-2",
        })}
      >
        <Calendar className="text-brand-navy h-3.5 w-3.5" />
        <span className="font-medium">Range:</span>
        <span>{RANGE_LABEL[value]}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="font-serif">Date range</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ORDER.map((key) => (
          <DropdownMenuItem
            key={key}
            onClick={() => onChange(key)}
            className="flex items-center justify-between"
          >
            <span>{RANGE_LABEL[key]}</span>
            {value === key && (
              <span className="text-brand-gold text-xs font-semibold">●</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
