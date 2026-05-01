"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ActionVariant = "outline" | "primary" | "bronze";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ActionVariant;
  icon?: ReactNode;
  children: ReactNode;
}

export function ActionButton({
  variant = "outline",
  icon,
  children,
  className,
  ...rest
}: Props) {
  const base =
    "inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[12px] font-medium tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const styles: Record<ActionVariant, string> = {
    outline:
      "border bg-card text-brand-charcoal hover:bg-muted/50",
    primary:
      "text-white hover:opacity-90",
    bronze:
      "text-white hover:opacity-90",
  };
  const inlineStyle: Record<ActionVariant, React.CSSProperties> = {
    outline: { borderColor: "var(--brand-border)" },
    primary: { background: "var(--brand-primary)" },
    bronze: { background: "var(--brand-accent)", color: "var(--brand-primary)" },
  };

  return (
    <button
      type="button"
      className={cn(base, styles[variant], className)}
      style={inlineStyle[variant]}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
