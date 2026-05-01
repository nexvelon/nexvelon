"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface CurrencyInputProps
  extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> {
  value: number;
  onChange: (next: number) => void;
  className?: string;
}

export function CurrencyInput({
  value,
  onChange,
  className,
  ...rest
}: CurrencyInputProps) {
  const [text, setText] = useState<string>(formatBlurred(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(formatBlurred(value));
  }, [value, focused]);

  return (
    <Input
      {...rest}
      inputMode="decimal"
      value={text}
      onFocus={() => {
        setFocused(true);
        setText(value === 0 ? "" : value.toString());
      }}
      onBlur={() => {
        setFocused(false);
        const parsed = parseFloat(text.replace(/[^0-9.\-]/g, ""));
        const next = isNaN(parsed) ? 0 : parsed;
        onChange(next);
        setText(formatBlurred(next));
      }}
      onChange={(e) => setText(e.target.value)}
      className={cn("text-right tabular-nums", className)}
    />
  );
}

function formatBlurred(n: number): string {
  if (!isFinite(n) || n === 0) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}
