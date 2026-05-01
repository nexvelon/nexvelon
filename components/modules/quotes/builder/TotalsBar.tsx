"use client";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import { formatCurrency } from "@/lib/format";
import { quoteTotals } from "@/lib/quote-helpers";
import type { QuoteSection } from "@/lib/types";

interface Props {
  sections: QuoteSection[];
  taxRatePct: number;
  discount: number;
  discountType: "pct" | "amount";
  onChangeDiscount: (n: number) => void;
  onChangeDiscountType: (t: "pct" | "amount") => void;
  disabled?: boolean;
}

export function TotalsBar({
  sections,
  taxRatePct,
  discount,
  discountType,
  onChangeDiscount,
  onChangeDiscountType,
  disabled,
}: Props) {
  const { role } = useRole();
  const showMargin = hasPermission(role, "quotes", "viewMargin");

  const totals = quoteTotals(sections, taxRatePct / 100, discount, discountType);

  return (
    <Card className="bg-card sticky bottom-0 z-10 grid grid-cols-1 items-center gap-x-6 gap-y-3 rounded-lg border border-[var(--border)] p-4 shadow-md md:grid-cols-12">
      <div className="md:col-span-4">
        <Label className="text-muted-foreground text-[10px] uppercase tracking-wider">
          Discount
        </Label>
        <div className="mt-1 flex items-center gap-2">
          <Input
            inputMode="decimal"
            value={discount.toString()}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              onChangeDiscount(isNaN(n) ? 0 : n);
            }}
            disabled={disabled}
            className="text-right text-xs tabular-nums"
            placeholder="0"
          />
          <Select
            value={discountType}
            onValueChange={(v) =>
              onChangeDiscountType((v ?? "pct") as "pct" | "amount")
            }
            disabled={disabled}
          >
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pct">%</SelectItem>
              <SelectItem value="amount">$</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {totals.discountAmount > 0 && (
          <p className="text-muted-foreground mt-1 text-[11px]">
            Applied:{" "}
            <span className="text-brand-charcoal tabular-nums">
              −{formatCurrency(totals.discountAmount)}
            </span>
          </p>
        )}
      </div>

      <div className="md:col-span-8 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
        <Stat label="Subtotal" value={formatCurrency(totals.subtotal)} />
        <Stat
          label={`Tax (${taxRatePct.toFixed(2)}%)`}
          value={formatCurrency(totals.tax)}
        />
        <Stat
          label="Total"
          value={formatCurrency(totals.total)}
          accent="primary"
        />
        {showMargin ? (
          <Stat
            label="Margin"
            value={`${(totals.margin * 100).toFixed(1)}%`}
            accent="gold"
          />
        ) : (
          <Stat label="Margin" value="•••" hint="Hidden for current role" />
        )}
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "primary" | "gold";
}) {
  return (
    <div>
      <p className="text-muted-foreground text-[10px] uppercase tracking-wider">
        {label}
      </p>
      <p
        className={
          accent === "primary"
            ? "text-brand-navy font-serif text-lg tabular-nums"
            : accent === "gold"
              ? "text-brand-gold font-serif text-lg tabular-nums"
              : "text-brand-charcoal text-base tabular-nums"
        }
      >
        {value}
      </p>
      {hint && (
        <p className="text-muted-foreground/80 text-[10px]">{hint}</p>
      )}
    </div>
  );
}
