"use client";

// A reusable colour field: a native swatch picker + a hex text input, kept in
// sync. Emits a hex string on change. Reused by the theme editor (UIDG-4) and
// intended for the wider component kit (UIDG-11).

import { cn } from "@/lib/utils";

/** Coerce a stored hex (3/6/8-digit) into the #rrggbb the native picker needs. */
function toSwatch(hex: string): string {
  const h = hex.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(h)) return `#${h.split("").map((c) => c + c).join("")}`;
  if (/^[0-9a-f]{8}$/i.test(h)) return `#${h.slice(0, 6)}`;
  if (/^[0-9a-f]{6}$/i.test(h)) return `#${h}`;
  return "#000000";
}

export function ColorInput({
  value,
  onChange,
  ariaLabel,
  invalid = false,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel?: string;
  invalid?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <input
        type="color"
        value={toSwatch(value)}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        aria-label={ariaLabel ? `${ariaLabel} colour picker` : "Colour picker"}
        className="h-7 w-7 shrink-0 cursor-pointer rounded border border-[var(--border)] bg-transparent p-0"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        spellCheck={false}
        className={cn(
          "h-7 w-24 rounded border bg-[var(--brand-card)] px-2 font-mono text-[11px] uppercase",
          invalid ? "border-red-500 text-red-600" : "border-[var(--border)]"
        )}
      />
    </div>
  );
}
